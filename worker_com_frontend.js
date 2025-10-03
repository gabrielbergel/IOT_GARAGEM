export default {
  /**
   * @param {Request} request
   * @param {{DB: D1Database}} env
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- ROTEADOR INTELIGENTE POR CAMINHO E MÉTODO ---

    // Rota da API: continua aceitando POST na URL raiz "/"
    if (path === "/" && request.method === "POST") {
      return await handleApiRequest(request, env);
    }
    
    // NOVA Rota do Frontend: aceita GET no caminho "/vagas"
    if (path === "/vagas" && request.method === "GET") {
      return await handleFrontendRequest(request, env);
    }

    // Se acessar a rota principal "/" com GET, mostra uma mensagem simples
    if (path === "/" && request.method === "GET") {
      return new Response("Endpoint da API. Acesse /vagas para ver o painel.");
    }

    // Para qualquer outra combinação, retorna "Não Encontrado"
    return new Response("Endpoint não encontrado.", { status: 404 });
  },
};

// --- FUNÇÃO DA API (Lida com POST em "/") ---
// NENHUMA MUDANÇA AQUI.
async function handleApiRequest(request, env) {
  try {
    const { id, status, distancia_cm, nivel_ruido_raw } = await request.json();
    if (!id || !status) {
      return new Response('Dados inválidos: "id" e "status" são obrigatórios.', { status: 400 });
    }
    const stmt = env.DB.prepare(
      `INSERT INTO vagas (id, status, distancia_cm, nivel_ruido_raw, ultima_atualizacao)
       VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         distancia_cm = excluded.distancia_cm,
         nivel_ruido_raw = excluded.nivel_ruido_raw,
         ultima_atualizacao = CURRENT_TIMESTAMP`
    );
    await stmt.bind(id, status, distancia_cm, nivel_ruido_raw).run();
    const responsePayload = { success: true, message: `Vaga ${id} atualizada com sucesso.` };
    return new Response(JSON.stringify(responsePayload), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });
  } catch (e) {
    console.error("ERRO NO WORKER (API):", e.message);
    return new Response(`Erro interno no Worker: ${e.message}`, { status: 500 });
  }
}

// --- FUNÇÃO DO FRONTEND (Lida com GET em "/vagas") ---
// NENHUMA MUDANÇA AQUI.
async function handleFrontendRequest(request, env) {
  try {
    const stmt = env.DB.prepare("SELECT id, status FROM vagas ORDER BY id ASC");
    const { results } = await stmt.all();
    let vagasHtml = "";
    if (results && results.length > 0) {
      vagasHtml = results.map((vaga) => `
        <div class="vaga ${vaga.status.toLowerCase()}">
          <div class="vaga-id">${vaga.id}</div>
          <div class="vaga-status">${vaga.status}</div>
        </div>
      `).join("");
    } else {
      vagasHtml = "<p>Aguardando dados das vagas...</p>";
    }
    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Status da Garagem</title>
        <meta http-equiv="refresh" content="5">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
          body { font-family: 'Inter', sans-serif; background-color: #f0f2f5; margin: 0; padding: 2em; text-align: center; color: #333; }
          h1 { margin-bottom: 1em; }
          .container { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; max-width: 1200px; margin: auto; }
          .vaga { border-radius: 8px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); color: white; text-align: left; }
          .vaga-id { font-size: 1.2em; font-weight: 700; }
          .vaga-status { font-size: 2.5em; font-weight: 700; text-align: right; text-transform: uppercase; }
          .livre { background: linear-gradient(45deg, #28a745, #218838); }
          .ocupada { background: linear-gradient(45deg, #dc3545, #c82333); }
          .movimentacao { background: linear-gradient(45deg, #ffc107, #e0a800); color: #333; }
        </style>
      </head>
      <body>
        <h1>Painel de Status da Garagem</h1>
        <div class="container">
          ${vagasHtml}
        </div>
      </body>
      </html>
    `;
    return new Response(html, {
      headers: { "Content-Type": "text/html;charset=UTF-8" }
    });
  } catch (e) {
    console.error("ERRO NO WORKER (FRONTEND):", e.message);
    return new Response(`Erro ao gerar a página: ${e.message}`, { status: 500 });
  }
}
