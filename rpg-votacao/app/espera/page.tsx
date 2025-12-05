"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RealtimeChannel } from "@supabase/supabase-js";

export default function EsperaPage() {
  const [user, setUser] = useState<any>(null);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // -----------------------------
  // 1. Carrega sessão correta
  // -----------------------------
  useEffect(() => {
    const loadSession = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user) {
        setUser(sessionData.session.user);
      }
    };

    loadSession();
  }, []);

  // -----------------------------
  // 2. Marca o usuário como online
  // -----------------------------
  useEffect(() => {
    if (!user) return;

    const registerOnline = async () => {
      console.log("registerOnline called "+user.id);
      await supabase.from("online_users").upsert({
        user_id: user.id,
        last_ping: new Date().toISOString(),
      });
    };

    // registra imediatamente
    registerOnline();

    // // mantém online a cada 5s
    // const interval = setInterval(registerOnline, 5000);

    // ao sair, marca offline
    const disconnect = async () => {
      await supabase.from("online_users").delete().eq("user_id", user.id);
    };

    window.addEventListener("beforeunload", disconnect);

    return () => {
      window.removeEventListener("beforeunload", disconnect);
      // clearInterval(interval);
    };
  }, [user]);

  // -----------------------------
  // 3. Realtime para atualizar contagem
  // -----------------------------
  useEffect(() => {
    const channel = supabase
      .channel("online-users")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "online_users" },
        () => {
          fetchCount();
        }
      )
      .subscribe();

    channelRef.current = channel;

    const fetchCount = async () => {
      const { data } = await supabase.from("online_users").select("*");

      if (Array.isArray(data)) {
        setOnlineUsers(data.length);

        if (data.length === 4) {
          setTimeout(() => {
            window.location.href = "/votacao";
          }, 5000);
        }
      }
    };

    fetchCount();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="text-white p-6 min-h-screen flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-xl max-w-md w-full text-center">
        <h1 className="text-2xl font-bold mb-4">Aguardando jogadores...</h1>

        <p className="text-gray-300 mb-6">
          Entraram: <strong>{onlineUsers}</strong> / 4
        </p>

        {onlineUsers === 4 && (
          <p className="text-green-400 text-xl font-bold">Iniciando em 5s...</p>
        )}

        <p className="text-sm text-gray-400 mt-4">
          Assim que todos entrarem, a votação será liberada.
        </p>
      </div>
    </div>
  );
}
