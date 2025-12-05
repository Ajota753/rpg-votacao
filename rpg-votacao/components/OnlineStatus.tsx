"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function OnlineStatus() {
  useEffect(() => {
    let userId: string | null = null;

    async function conectar() {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) return;

      userId = data.user.id;

      // Marca login e primeiro ping
      await supabase.from("usuarios_online").upsert({
        user_id: userId,
        online: true,
        last_login: new Date(),
        last_ping: new Date(),
      });
    }

    conectar();

    // Atualiza last_ping a cada 5s
    const interval = setInterval(async () => {
      if (!userId) return;

      await supabase
        .from("usuarios_online")
        .update({ last_ping: new Date() })
        .eq("user_id", userId);
    }, 5000);

    // Marca offline ao fechar a aba
    const marcarOffline = async () => {
      if (userId) {
        await supabase
          .from("usuarios_online")
          .update({
            online: false,
            last_logout: new Date(),
          })
          .eq("user_id", userId);
      }
    };

    window.addEventListener("beforeunload", marcarOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", marcarOffline);
      marcarOffline();
    };
  }, []);

  return null;
}
