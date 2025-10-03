Projeto: Monitoramento de Vagas de Estacionamento com IoT
Status: Versão 1.0 - Funcional

Este projeto implementa um sistema de Internet das Coisas (IoT) de ponta-a-ponta para monitorar o status de vagas de estacionamento em tempo real. Utilizando um microcontrolador ESP32 com sensores, os dados são capturados, enviados para a nuvem através do protocolo MQTT e persistidos em um banco de dados serverless.

O resultado é uma solução escalável e eficiente para consultar a ocupação de vagas a partir de dados gerados por hardware de baixo custo.

Arquitetura da Solução
O fluxo de dados segue a seguinte arquitetura:

[ESP32 com Sensores] → [Broker MQTT] → [Ponte Node.js] → [Cloudflare Worker] → [Cloudflare D1]

Tecnologias Utilizadas
Hardware: ESP32

Comunicação IoT: Protocolo MQTT (utilizando o broker público test.mosquitto.org)

Ponte (Bridge): Node.js (mqtt.js, axios)

Plataforma Serverless: Cloudflare Workers

Banco de Dados: Cloudflare D1 (SQLite Serverless)

Linguagens: C/C++ (Arduino para ESP32), JavaScript (Node.js e Cloudflare Worker)

Componentes Detalhados
Cada parte do projeto tem uma função específica e essencial para o funcionamento do todo.

1. ESP32 (O Sensor Inteligente)
O que é? O ESP32 é um microcontrolador de baixo custo com Wi-Fi e Bluetooth integrados, ideal para projetos de IoT. Ele é o "cérebro" da operação no local da vaga.

Qual seu papel?

Ler os Sensores: Ele lê continuamente os dados de sensores acoplados (como um sensor ultrassônico para medir a distância de um veículo).

Processar os Dados: Com base na distância lida, o código no ESP32 determina o status da vaga ("LIVRE" ou "OCUPADA").

Enviar a Informação: Ele se conecta à rede Wi-Fi, formata os dados em um padrão universal (JSON) e os publica em um tópico MQTT específico, enviando a informação para a internet.

2. MQTT (O Carteiro da IoT)
O que é? MQTT (Message Queuing Telemetry Transport) é um protocolo de mensagens extremamente leve, projetado para dispositivos com poucos recursos. Ele funciona no modelo "Publicar/Assinar" (Publish/Subscribe).

Qual seu papel?

Desacoplamento: O ESP32 (publicador) não precisa saber quem vai receber a informação. Ele apenas envia a mensagem para um "endereço" (o tópico MQTT, ex: garagem/vagas/status) em um servidor central (o Broker MQTT).

Eficiência: Garante uma comunicação rápida e com baixo consumo de dados e energia, perfeita para o ESP32.

3. Ponte (Bridge) Node.js (O Tradutor)
O que é? É um script simples em Node.js que roda em uma máquina (pode ser seu PC ou um servidor).

Qual seu papel?

Ouvir o Carteiro: A ponte "assina" o mesmo tópico MQTT que o ESP32 está publicando. Sua única função é ficar ouvindo as mensagens que chegam.

Traduzir e Encaminhar: Quando uma mensagem do ESP32 chega via MQTT, a ponte a "traduz" para o mundo da web, convertendo-a em uma requisição HTTP POST e a envia para a URL pública do nosso Cloudflare Worker. Ela serve como uma ponte entre o protocolo MQTT (do mundo IoT) e o protocolo HTTP (do mundo web).

4. Cloudflare Worker (O Processador na Nuvem)
Aqui, dividimos em duas partes: o código e a execução.

Código-Fonte (Pasta Local no PC)
É a "planta baixa" do nosso serviço. A pasta no seu computador contém os arquivos index.js e wrangler.jsonc, onde escrevemos a lógica que será executada. Todo o desenvolvimento é feito localmente.

Execução na Nuvem
Após o comando npx wrangler deploy, esse código passa a existir e rodar na rede global da Cloudflare.

Receber a Requisição: Ele possui uma URL pública e fica aguardando as requisições HTTP POST enviadas pela nossa "Ponte".

Validar os Dados: Ele recebe o corpo da requisição, interpreta o JSON e verifica se os dados essenciais (id, status) estão presentes.

Comunicar com o Banco: Ele é o único componente que tem a "chave" para acessar e dar comandos ao nosso banco de dados D1.

5. Cloudflare D1 (A Memória Permanente)
O que é? Um banco de dados SQL serverless oferecido pela Cloudflare, baseado em SQLite.

Qual seu papel?

Armazenar os Dados: Recebe os comandos SQL do Cloudflare Worker.

Persistência: Executa a query INSERT ... ON CONFLICT DO UPDATE, que insere uma nova vaga se ela não existir, ou apenas atualiza o status e o horário da última atualização se a vaga já estiver registrada.

Fonte da Verdade: Guarda o estado mais recente de todas as vagas, permitindo que, no futuro, outras aplicações (como um painel web ou um aplicativo) possam consultá-lo para mostrar quais vagas estão livres ou ocupadas.
