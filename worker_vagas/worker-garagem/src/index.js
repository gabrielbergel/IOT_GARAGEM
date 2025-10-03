export default {
  /**
   * @param {Request} request
   * @param {{DB: D1Database}} env
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    // Este Worker só aceita requisições do tipo POST
    if (request.method !== 'POST') {
      return new Response('Método não permitido. Use POST.', { status: 405 });
    }

    try {
      // --- PASSO 1: RECEBER E INTERPRETAR O JSON ---
      // Pega o corpo da requisição enviada pela sua "ponte" (ponte-local.js)
      const body = await request.json();
      
      // A "ponte" agora envia o JSON diretamente, sem codificar
      const { id, status, distancia_cm, nivel_ruido_raw } = body;

      // Validação para garantir que os dados essenciais estão presentes
      if (!id || !status) {
        return new Response('Dados inválidos: "id" e "status" são obrigatórios.', { status: 400 });
      }

      // --- PASSO 2: PREPARAR E ENVIAR OS DADOS PARA O BANCO D1 ---
      // Esta é a query SQL de "UPSERT":
      // - INSERT: Insere uma nova linha se o 'id' da vaga não existir.
      // - ON CONFLICT... DO UPDATE: Se o 'id' já existir, ele apenas atualiza os dados.
      const stmt = env.DB.prepare(
        `INSERT INTO vagas (id, status, distancia_cm, nivel_ruido_raw, ultima_atualizacao)
         VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           distancia_cm = excluded.distancia_cm,
           nivel_ruido_raw = excluded.nivel_ruido_raw,
           ultima_atualizacao = CURRENT_TIMESTAMP`
      );

      // Associa os valores do JSON aos parâmetros (?1, ?2, etc.) da query de forma segura
      await stmt.bind(id, status, distancia_cm, nivel_ruido_raw).run();

      // --- PASSO 3: RETORNAR UMA RESPOSTA DE SUCESSO ---
      const responsePayload = { success: true, message: `Vaga ${id} atualizada com status: ${status}` };
      return new Response(JSON.stringify(responsePayload), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });

    } catch (e) {
      // Se qualquer coisa der errado, retorna uma mensagem de erro detalhada
      console.error('Erro no Worker:', e);
      return new Response(`Erro ao processar a requisição: ${e.message}`, { status: 500 });
    }
  },
};