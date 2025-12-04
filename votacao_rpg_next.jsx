/*
Votação RPG — Exemplo completo (Single-file React component / Next.js page)

O que este arquivo contém:
- Login com Supabase (Magic Link)
- Sala de espera (realtime com tabela `online_users`)
- Desbloqueio automático quando 5 usuários estiverem online
- Consulta da menor `Chave` com `Valido = true` e `Concluida = false`
- Exibição dos temas dessa chave (até 3, mas pega todos disponíveis)
- Seleção (toggle) + botão Confirmar que incrementa votos com RPC no Supabase
- Tratamento básico de UX (loading, erros)

OBS: Este arquivo é um exemplo portátil. Em um projeto Next.js, salve como
/pages/index.jsx ou /app/page.jsx (dependendo do seu setup). Requer Tailwind
para a estilização mostrada. Você também precisará instalar `@supabase/supabase-js`.

Variáveis de ambiente (defina no Vercel ou .env.local):
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

Recomendações de tabelas / SQL (rode no SQL editor do Supabase):

-- Tabela Temas
create table if not exists Temas (
  id uuid primary key default gen_random_uuid(),
  temas text,
  quem_sugeriu text,
  chave int,
  nivel int,
  votos int default 0,
  valido boolean default true,
  concluida boolean default false,
  inserted_at timestamptz default now()
);

-- Tabela online_users
create table if not exists online_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_email text,
  online boolean default true,
  updated_at timestamptz default now()
);

-- RPC para incrementar votos (atomic)
create or replace function add_vote(tema_id uuid)
returns void language plpgsql as $$
begin
  update "Temas"
  set votos = votos + 1
  where id = tema_id;
end;
$$;

-- (Opcional) trigger para atualizar updated_at de online_users
create or replace function touch_online_users() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_touch_online_users
before update on online_users
for each row
execute function touch_online_users();


-- Observação:
-- Você pode também criar uma tabela `votes` para gravar qual usuário votou em qual tema,
-- e assim evitar votar duas vezes por usuário. Neste exemplo simples, estou apenas
-- incrementando o contador em `Temas` via função add_vote.

*/

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// inicialização do Supabase (usa variáveis de ambiente)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function VotacaoRPG() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // sala de espera
  const [onlineCount, setOnlineCount] = useState(0);
  const [desbloqueado, setDesbloqueado] = useState(false);

  // temas
  const [temas, setTemas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loadingTemas, setLoadingTemas] = useState(false);

  // feedback
  const [msg, setMsg] = useState(null);

  // canal realtime
  const channelRef = useRef(null);

  useEffect(() => {
    // checar sessão inicial
    let mounted = true;
    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(data?.session?.user ?? null);
      setLoadingAuth(false);
    }
    init();

    // escutar mudanças de autenticação
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // quando user loga, registra online e conecta realtime
  useEffect(() => {
    if (!user) return;

    let myRowId = null;

    async function enterOnline() {
      // insere ou atualiza a linha de online
      // tenta achar por user_id
      const { data: existing } = await supabase
        .from('online_users')
        .select('*')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (existing) {
        myRowId = existing.id;
        await supabase.from('online_users').update({ online: true, user_email: user.email }).eq('id', myRowId);
      } else {
        const { data } = await supabase.from('online_users').insert([{ user_id: user.id, user_email: user.email, online: true }]).select().single();
        myRowId = data.id;
      }

      // cria canal realtime para updates na tabela online_users
      const channel = supabase
        .channel('public:online_users')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'online_users' }, payload => {
          fetchOnlineCount();
        })
        .subscribe();

      channelRef.current = channel;

      // sempre que a página for fechada, marcar offline (fallback)
      const handleBeforeUnload = async () => {
        try {
          if (myRowId) {
            await supabase.from('online_users').update({ online: false }).eq('id', myRowId);
          }
        } catch (e) {
          // ignore
        }
      };

      window.addEventListener('beforeunload', handleBeforeUnload);

      // cleanup
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      };
    }

    enterOnline();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchOnlineCount() {
    const { data } = await supabase.from('online_users').select('*').eq('online', true);
    setOnlineCount(Array.isArray(data) ? data.length : 0);
    if (Array.isArray(data) && data.length >= 5) {
      setDesbloqueado(true);
    } else {
      setDesbloqueado(false);
    }
  }

  // busca temas apenas quando desbloqueado
  useEffect(() => {
    if (!desbloqueado) return;
    carregarTemasDaMenorChave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desbloqueado]);

  async function carregarTemasDaMenorChave() {
    setLoadingTemas(true);
    setTemas([]);
    try {
      // 1) pegar a menor chave com valido = true e concluida = false
      const { data: chaveRes, error: e1 } = await supabase
        .from('Temas')
        .select('chave')
        .eq('valido', true)
        .eq('concluida', false)
        .order('chave', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (e1) throw e1;
      const chave = chaveRes?.chave;
      if (!chave && chave !== 0) {
        setMsg('Nenhuma chave disponível');
        setLoadingTemas(false);
        return;
      }

      // 2) pegar temas dessa chave (limit 3)
      const { data: temasRes, error: e2 } = await supabase
        .from('Temas')
        .select('*')
        .eq('chave', chave)
        .eq('valido', true)
        .eq('concluida', false)
        .order('inserted_at', { ascending: true });

      if (e2) throw e2;

      setTemas(temasRes ?? []);
      setMsg(null);

      // inscreve canal realtime para os temas desta chave (opcional)
      // você pode querer atualizar o contador de votos em tempo real
      // (não implementado aqui para manter simples)

    } catch (err) {
      console.error(err);
      setMsg('Erro ao carregar temas');
    } finally {
      setLoadingTemas(false);
    }
  }

  async function handleLogin(email) {
    setMsg('Enviando magic link...');
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) setMsg('Erro ao enviar link: ' + error.message);
    else setMsg('Link enviado! Verifique seu e-mail.');
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setTemas([]);
    setSelected(null);
    setDesbloqueado(false);
  }

  async function confirmarVoto() {
    if (!selected) return;
    setMsg('Confirmando voto...');

    try {
      // chama RPC add_vote
      const { error } = await supabase.rpc('add_vote', { tema_id: selected });
      if (error) throw error;

      // opcional: registrar em votes (não implementado aqui)

      setMsg('Voto confirmado!');

      // refrescar lista de temas (para pegar novo contador de votos)
      carregarTemasDaMenorChave();

      // depois de votar você pode bloquear re-votos para esse usuário (não implementado)
      setSelected(null);
    } catch (err) {
      console.error(err);
      setMsg('Erro ao confirmar voto');
    }
  }

  // UI
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-gray-800 rounded-2xl shadow-lg p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Votação — Temas RPG</h1>
          <p className="text-sm text-gray-300 mt-1">Login via e-mail (magic link). Sala de espera com 5 jogadores (você + 4 amigos).</p>
        </header>

        <main>
          {!user && (
            <AuthCard onLogin={handleLogin} msg={msg} />
          )}

          {user && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm">Logado como</div>
                  <div className="font-medium">{user.email}</div>
                </div>

                <div className="text-right">
                  <div className="text-sm">Online agora</div>
                  <div className="font-bold text-lg">{onlineCount}</div>
                  <div className="mt-2">
                    <button onClick={handleLogout} className="px-3 py-1 rounded bg-red-500 text-white text-sm">Logout</button>
                  </div>
                </div>
              </div>

              {!desbloqueado && (
                <div className="p-6 rounded-xl bg-gray-700 text-center">
                  <h2 className="text-xl font-semibold">Aguardando todos entrarem</h2>
                  <p className="mt-2 text-gray-300">Estamos esperando 5 jogadores. Atualmente: <span className="font-bold">{onlineCount}</span></p>
                  <p className="mt-3 text-sm text-gray-400">Quando todos estiverem online, a votação será desbloqueada automaticamente.</p>
                </div>
              )}

              {desbloqueado && (
                <div>
                  <h2 className="text-xl font-semibold mb-2">Escolha um tema</h2>

                  {loadingTemas && <p className="text-gray-300">Carregando temas...</p>}

                  {!loadingTemas && temas.length === 0 && (
                    <p className="text-gray-300">Nenhum tema encontrado para a chave atual.</p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    {temas.map(t => (
                      <div
                        key={t.id}
                        onClick={() => setSelected(prev => prev === t.id ? null : t.id)}
                        className={`p-4 rounded-xl cursor-pointer border ${selected === t.id ? 'border-indigo-400 bg-indigo-700' : 'border-transparent bg-gray-700 hover:bg-gray-650'}`}
                      >
                        <div className="font-bold text-lg">{t.temas}</div>
                        <div className="text-sm text-gray-300 mt-2">Quem sugeriu: {t.quem_sugeriu}</div>
                        <div className="text-sm text-gray-400 mt-2">Votos: {t.votos ?? 0}</div>
                        <div className="text-xs text-gray-500 mt-1">Chave: {t.chave} • Nível: {t.nivel}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex items-center gap-4">
                    <button
                      onClick={confirmarVoto}
                      disabled={!selected}
                      className={`px-4 py-2 rounded-lg ${selected ? 'bg-green-500' : 'bg-gray-600 cursor-not-allowed'}`}
                    >
                      Confirmar voto
                    </button>

                    <button onClick={() => { setSelected(null); setMsg(null); }} className="px-3 py-2 rounded-lg bg-gray-600">Cancelar</button>

                    {msg && <div className="text-sm text-gray-300 ml-4">{msg}</div>}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        <footer className="mt-6 text-xs text-gray-400">
          Dica: Para deploy gratis, use Vercel. Configure as variáveis de ambiente do Supabase no painel do Vercel.
        </footer>
      </div>
    </div>
  );
}

function AuthCard({ onLogin, msg }) {
  const [email, setEmail] = useState('');
  return (
    <div className="p-6 rounded-xl bg-gray-700">
      <h2 className="text-lg font-semibold mb-2">Entrar</h2>
      <p className="text-sm text-gray-300 mb-4">Digite seu e-mail e receba um link mágico para fazer login.</p>
      <div className="flex gap-2">
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@exemplo.com" className="flex-1 px-3 py-2 rounded bg-gray-800 border border-gray-600" />
        <button onClick={() => onLogin(email)} className="px-4 py-2 rounded bg-indigo-600">Enviar</button>
      </div>
      {msg && <div className="text-sm text-gray-300 mt-3">{msg}</div>}

      <div className="mt-4 text-xs text-gray-500">
        {/* Nota: Se quiser usar OAuth (Google/GitHub), configure no Supabase e use `supabase.auth.signInWithOAuth({ provider: 'google' })`. */}
      </div>
    </div>
  );
}
