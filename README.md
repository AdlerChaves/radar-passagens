# ✈ Radar de Passagens Inteligente

MVP funcional de monitoramento de passagens aéreas com alertas gerados por IA.

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                      │
│  Dashboard │ Criar Alerta │ Histórico & Gráficos         │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP REST
┌────────────────────────▼────────────────────────────────┐
│                   BACKEND (Node/Express)                 │
│                                                         │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────┐    │
│  │  Routes   │  │ Scheduler │  │   Serviços       │    │
│  │  /api/*   │  │ node-cron │  │ ┌──────────────┐ │    │
│  └───────────┘  └────┬──────┘  │ │ flightService│ │    │
│                       │         │ │ priceAnalysis│ │    │
│                       ▼         │ │ aiService    │ │    │
│              ┌─────────────┐   │ │ notification │ │    │
│              │ priceMonitor│   │ └──────────────┘ │    │
│              │   job       │   └──────────────────┘    │
│              └──────┬──────┘                            │
└─────────────────────┼───────────────────────────────────┘
                      │
        ┌─────────────┼──────────────┐
        ▼             ▼              ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │  SQLite  │  │  OpenAI  │  │  Resend  │
  │   (DB)   │  │   API    │  │  Email   │
  └──────────┘  └──────────┘  └──────────┘
                      │
              ┌───────┴───────┐
              │ API de Voos   │
              │ (Amadeus/Mock)│
              └───────────────┘
```

### Fluxo principal

```
[Scheduler dispara a cada 6h]
        │
        ▼
[Busca todas as searches ativas no DB]
        │
        ▼ para cada search:
[Chama API de voos / Mock]
        │
        ▼
[Salva preço no histórico]
        │
        ▼
[analyzeOpportunity()]
  ├── Menor preço histórico? → severity: HIGH
  ├── > 15% abaixo da média? → severity: MEDIUM
  ├── Abaixo da mediana?     → severity: LOW
  └── Queda recente?         → severity: MEDIUM
        │
        ▼ (se for oportunidade)
[generateAlertMessage() via OpenAI ou template]
        │
        ▼
[sendEmailAlert() via Resend]
        │
        ▼
[recordAlertSent() no DB]
```

---

## 📁 Estrutura de Pastas

```
radar-passagens/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js       # SQLite + schema
│   │   ├── services/
│   │   │   ├── flightService.js  # Busca voos (Mock/Amadeus)
│   │   │   ├── priceAnalysisService.js # Detecta oportunidades
│   │   │   ├── aiService.js      # Gera mensagens com OpenAI
│   │   │   └── notificationService.js  # Envia emails
│   │   ├── routes/
│   │   │   └── index.js          # Todas as rotas REST
│   │   ├── jobs/
│   │   │   └── priceMonitor.js   # Scheduler cron
│   │   └── utils/
│   │       └── seed.js           # Dados de demo
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.js      # Lista de alertas + stats
│       │   ├── CreateAlert.js    # Formulário + modo IA
│       │   └── AlertDetails.js  # Gráfico histórico
│       ├── utils/
│       │   └── api.js            # Cliente HTTP
│       ├── App.js                # Roteamento + Header
│       └── App.css               # Estilos completos
│
├── docker-compose.yml
└── README.md
```

---

## ⚡ Como Rodar Localmente

### Pré-requisitos
- Node.js 18+
- npm

### 1. Backend

```bash
cd backend

# Instala dependências
npm install

# Configura variáveis de ambiente
cp .env.example .env
# Edite o .env (USE_MOCK_API=true não precisa de chaves reais)

# Popula com dados de demo
npm run seed

# Inicia o servidor
npm run dev
```

O backend estará em: `http://localhost:3001`

Verifique: `http://localhost:3001/api/health`

### 2. Frontend

```bash
cd frontend

# Instala dependências
npm install

# Inicia o frontend
npm start
```

O frontend estará em: `http://localhost:3000`

---

## 🔧 Configuração por Etapas

### Etapa 1 — MVP Zero (sem chaves de API)

Edite `backend/.env`:
```env
USE_MOCK_API=true
# Deixe OPENAI_API_KEY e RESEND_API_KEY em branco
```

Funciona 100%. Usa preços simulados realistas e templates de mensagem locais.
Os "emails" são logados no console (não enviados de verdade).

### Etapa 2 — Adiciona IA real

```env
OPENAI_API_KEY=sk-...
```

Agora as mensagens de alerta são geradas pelo GPT-3.5-turbo com contexto real de preços.

### Etapa 3 — Emails reais

Crie conta gratuita em [resend.com](https://resend.com) (100 emails/dia grátis):
```env
RESEND_API_KEY=re_...
EMAIL_FROM=alertas@seudominio.com
```

### Etapa 4 — API de voos real

Cadastre na [Amadeus for Developers](https://developers.amadeus.com) (free tier):
```env
USE_MOCK_API=false
AMADEUS_CLIENT_ID=...
AMADEUS_CLIENT_SECRET=...
```

---

## 📡 API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/users` | Cadastrar/buscar usuário |
| `GET` | `/api/searches?userId=X` | Listar buscas do usuário |
| `POST` | `/api/searches` | Criar nova busca |
| `PATCH` | `/api/searches/:id` | Ativar/pausar |
| `DELETE` | `/api/searches/:id` | Remover busca |
| `GET` | `/api/searches/:id/history` | Histórico de preços |
| `GET` | `/api/alerts?userId=X` | Alertas enviados |
| `POST` | `/api/interpret` | Interpreta input com IA |
| `GET` | `/api/discovery?origin=GRU` | Modo descoberta |
| `POST` | `/api/trigger-check` | Dispara verificação manual |
| `GET` | `/api/health` | Status do sistema |

### Exemplo de uso

```bash
# Criar usuário
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "João", "email": "joao@email.com"}'

# Criar alerta GRU → Rio
curl -X POST http://localhost:3001/api/searches \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "ID_DO_USUARIO",
    "origin": "GRU",
    "destination": "GIG",
    "destinationLabel": "Rio de Janeiro",
    "preference": "cheapest"
  }'

# Disparar verificação manual
curl -X POST http://localhost:3001/api/trigger-check
```

---

## 🧠 Lógica de Detecção de Oportunidades

```javascript
// Ordem de prioridade:
1. historical_low   → preço <= mínimo dos últimos 30 dias
2. below_average    → preço > 15% abaixo da média histórica
3. price_drop       → queda > 15% em relação ao preço anterior
4. below_median     → preço < 90% da mediana histórica

// Severidade:
- HIGH:   queda > 30% ou mínimo histórico
- MEDIUM: queda 15-30%
- LOW:    abaixo da mediana

// Proteção anti-spam:
- Máximo 1 alerta por busca a cada 24 horas
- Mínimo 3 verificações no histórico para ativar alertas
```

---

## 📊 Modelos de Dados

### users
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | TEXT (UUID) | PK |
| name | TEXT | Nome |
| email | TEXT (UNIQUE) | Email |
| whatsapp | TEXT | Para futuro WhatsApp |

### searches
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | TEXT (UUID) | PK |
| user_id | TEXT (FK) | Usuário dono |
| origin | TEXT | Código IATA origem |
| destination | TEXT | Código IATA destino |
| travel_date | TEXT | Data (null = flexível) |
| preference | TEXT | cheapest/fastest/best_value |
| is_discovery_mode | INTEGER | 0/1 |
| is_active | INTEGER | 0/1 |

### price_history
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | TEXT (UUID) | PK |
| search_id | TEXT (FK) | Busca relacionada |
| price | REAL | Preço encontrado (BRL) |
| airline | TEXT | Companhia aérea |
| stops | INTEGER | Nº de escalas |
| checked_at | DATETIME | Quando foi verificado |

### alerts_sent
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | TEXT (UUID) | PK |
| search_id | TEXT (FK) | Busca relacionada |
| alert_type | TEXT | Tipo de oportunidade |
| message | TEXT | Mensagem gerada pela IA |
| channel | TEXT | email/whatsapp |
| sent_at | DATETIME | Quando foi enviado |

---

## 🚀 Sugestões de Evolução Após MVP

### Semana 2-3 (monetização rápida)
- [ ] Plano free (3 alertas) vs pago (ilimitado)
- [ ] Stripe para pagamento
- [ ] Integração WhatsApp via Twilio ou Z-API
- [ ] Email de boas-vindas com tutorial

### Mês 2 (produto)
- [ ] Troca SQLite → PostgreSQL (Supabase gratuito)
- [ ] Autenticação real (Magic Link via email)
- [ ] Dashboard analytics: quantos alertas, média de economia
- [ ] Alertas de ida e volta (round-trip)
- [ ] Destinos internacionais no modo descoberta
- [ ] Histórico de preços mais longo (90 dias)

### Mês 3 (crescimento)
- [ ] Landing page pública com contador de alertas enviados
- [ ] Modo "compartilhar oportunidade" nas redes sociais
- [ ] API pública para parceiros (agências de viagem)
- [ ] App mobile (React Native / Expo)
- [ ] Machine learning para predição de melhores datas

### Infraestrutura (quando escalar)
- [ ] Deploy: Railway ou Render (backend) + Vercel (frontend)
- [ ] Fila de jobs: BullMQ para processar alertas em paralelo
- [ ] Cache: Redis para histórico de preços frequentes
- [ ] Monitoring: Sentry para erros + Uptime Robot

---

## 💡 Dicas de Lançamento

1. **Valide antes de codar mais**: Lance com 20-30 beta users antes de adicionar features
2. **Use o modo mock**: Não precisa de API de voos real para testar o fluxo completo
3. **Email como MVP de notificação**: WhatsApp vem depois. Email funciona e tem boas taxas de abertura para alertas de viagem
4. **Preço sugerido inicial**: R$19/mês para ilimitado, free para 3 alertas

---

## 🛠️ Stack Resumida

| Camada | Tecnologia | Custo |
|--------|-----------|-------|
| Backend | Node.js + Express | Grátis |
| Banco | SQLite (arquivo) | Grátis |
| Scheduler | node-cron | Grátis |
| Frontend | React | Grátis |
| Email | Resend (free tier) | Grátis até 100/dia |
| LLM | OpenAI GPT-3.5 | ~$0.001/alerta |
| API Voos | Amadeus test | Grátis (1000 req/mês) |
| Hospedagem | Railway | ~$5/mês |

**Custo estimado para 100 usuários**: < R$30/mês
#   r a d a r - p a s s a g e n s  
 #   r a d a r - p a s s a g e n s  
 