"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Tema = {
  id: number;
  temas: string;
  quem_sugeriu: string;
  chave: number;
  nivel: number;
  votos: number | null;
  valido: boolean;
  concluida: boolean;
};

export default function VotacaoPage() {
  const [temas, setTemas] = useState<Tema[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    const fetchTemas = async () => {
      const { data, error } = await supabase
        .from("Temas RPG")
        .select("*")
        .eq("valido", true)
        .eq("concluida", false)
        .order("chave", { ascending: true });

      if (!error && data) setTemas(data.slice(0, 3));
    };

    fetchTemas();
  }, []);

  const confirmarVoto = async () => {
    if (!selected) return;

    await supabase
      .from("Temas RPG")
      .update({ votos: supabase.rpc("increment_voto") })
      .eq("id", selected);

    alert("Voto registrado!");
  };

  return (
    <div className="min-h-screen text-white p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Votação RPG</h1>

      <div className="flex flex-col gap-4 max-w-xl mx-auto">
        {temas.map((t) => (
          <div
            key={t.id}
            onClick={() => setSelected(selected === t.id ? null : t.id)}
            className={`p-4 rounded-xl cursor-pointer border ${
              selected === t.id
                ? "border-blue-500 bg-blue-900"
                : "border-gray-700 bg-gray-800"
            }`}
          >
            <h2 className="text-xl font-bold">{t.temas}</h2>
            <p>Quem sugeriu: {t.quem_sugeriu}</p>
            <p>Votos: {t.votos ?? 0}</p>
          </div>
        ))}
      </div>

      {selected && (
        <button
          onClick={confirmarVoto}
          className="mt-6 block mx-auto bg-blue-600 px-6 py-3 rounded-lg hover:bg-blue-700"
        >
          Confirmar voto
        </button>
      )}
    </div>
  );
}
