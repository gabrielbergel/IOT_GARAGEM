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

    // --- ROTEADOR ---

    // Rota da API para receber dados (POST em "/") - SEM MUDANÇAS
    if (path === "/" && request.method === "POST") {
      return await handleApiPostRequest(request, env);
    }
    
    // NOVA Rota da API para o frontend buscar dados (GET em "/api/vagas")
    if (path === "/api/vagas" && request.method === "GET") {
      return await handleApiVagasRequest(request, env);
    }

    // Rota do Frontend (GET em "/vagas") - SERVIRÁ O HTML COM SCRIPT
    if (path === "/vagas" && request.method === "GET") {
      return await handleFrontendRequest(request, env);
    }

    // Rota principal (GET em "/")
    if (path === "/" && request.method === "GET") {
      return new Response("Endpoint da API. Acesse /vagas para ver o painel.");
    }

    return new Response("Endpoint não encontrado.", { status: 404 });
  },
};

// --- FUNÇÃO DA API (POST) ---
// Renomeada para clareza, mas sem mudança na lógica.
async function handleApiPostRequest(request, env) {
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
    console.error("ERRO NO WORKER (API POST):", e.message);
    return new Response(`Erro interno no Worker: ${e.message}`, { status: 500 });
  }
}

// --- NOVA FUNÇÃO - API que retorna os dados das vagas em JSON ---
async function handleApiVagasRequest(request, env) {
  try {
    // Busca os dados no banco de dados D1
    const stmt = env.DB.prepare("SELECT id, status FROM vagas ORDER BY id ASC");
    const { results } = await stmt.all();
    
    // Retorna os resultados como uma resposta JSON
    return new Response(JSON.stringify(results || []), {
      headers: { 
        "Content-Type": "application/json;charset=UTF-8",
        "Cache-Control": "no-cache" // Garante que o navegador sempre busque a versão mais recente
      }
    });

  } catch (e) {
    console.error("ERRO NA API DE VAGAS (GET):", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}


// --- FUNÇÃO DO FRONTEND MODIFICADA ---
// Agora serve um HTML "esqueleto" que se atualiza com JavaScript.
async function handleFrontendRequest(request, env) {
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Status da Garagem</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
        body { font-family: 'Inter', sans-serif; background-color: #f0f2f5; margin: 0; padding: 2em; text-align: center; color: #333; }
        h1 { margin-bottom: 1em; }
        .container { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; max-width: 1200px; margin: auto; }
        .vaga { border-radius: 8px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); color: white; text-align: left; transition: background-color 0.5s ease; }
        .vaga-id { font-size: 1.2em; font-weight: 700; }
        .vaga-status { font-size: 2.5em; font-weight: 700; text-align: right; text-transform: uppercase; }
        .livre { background: linear-gradient(45deg, #28a745, #218838); }
        .ocupada { background: linear-gradient(45deg, #dc3545, #c82333); }
        .movimentacao { background: linear-gradient(45deg, #ffc107, #e0a800); color: #333; }
      </style>
    </head>
    <body>
      <h1>Painel de Status da Garagem</h1>
      <div class="container" id="vagas-container">
        <p>Carregando status das vagas...</p>
      </div>

      <script>
        const container = document.getElementById('vagas-container');

        // Função que busca os dados da API e atualiza o HTML
        async function fetchAndUpdateVagas() {
          try {
            const response = await fetch('/api/vagas'); // Chama nossa nova API de dados
            if (!response.ok) throw new Error('Falha ao buscar dados');
            
            const vagas = await response.json();
            
            // Limpa o container
            container.innerHTML = '';
            
            if (vagas.length === 0) {
              container.innerHTML = '<p>Aguardando dados das vagas...</p>';
              return;
            }

            // Cria e adiciona os elementos de cada vaga
            vagas.forEach(vaga => {
              const vagaElement = document.createElement('div');
              vagaElement.className = 'vaga ' + vaga.status.toLowerCase();
              vagaElement.innerHTML = \`
                <div class="vaga-id">\${vaga.id}</div>
                <div class="vaga-status">\${vaga.status}</div>
              \`;
              container.appendChild(vagaElement);
            });

          } catch (error) {
            console.error('Erro ao atualizar vagas:', error);
            container.innerHTML = '<p>Ocorreu um erro ao carregar os dados. Tentando novamente...</p>';
          }
        }

        // Executa a função imediatamente ao carregar a página
        fetchAndUpdateVagas();

        // Configura para executar a função a cada 5 segundos
        setInterval(fetchAndUpdateVagas, 5000);
      </script>
    </body>
    </html>
  `;
  return new Response(html, {
    headers: { "Content-Type": "text/html;charset=UTF-8" },
  });
}
