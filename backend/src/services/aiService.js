// src/services/aiService.js
const OpenAI = require('openai');

let openai;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/**
 * Gera mensagem de alerta inteligente usando LLM
 * Se não tiver API key, usa templates locais (ótimos para MVP)
 */

async function generateAlertMessage({ search, priceData, analysis }) {
  const { opportunity, stats } = analysis;
  const { price, airline, stops, departure_datetime, deep_link } = priceData;

  const context = buildContext({ search, priceData, analysis });

  // Tenta usar OpenAI se disponível
  if (openai) {
    try {
      return await generateWithAI(context);
    } catch (err) {
      console.error('OpenAI falhou, usando template:', err.message);
    }
  }

  // Fallback: templates locais inteligentes
  return generateWithTemplate(context);
}

function buildContext({ search, priceData, analysis }) {
  const { opportunity, stats } = analysis;
  const { price, airline, stops, departure_datetime, deep_link } = priceData;

  const origin = search.origin;
  const destination = search.destination_label || search.destination;
  const formattedDate = departure_datetime
    ? new Date(departure_datetime).toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long'
      })
    : 'data flexível';
  const formattedPrice = price.toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL'
  });

  return {
    origin,
    destination,
    price,
    formattedPrice,
    airline,
    stops,
    formattedDate,
    deep_link,
    opportunity,
    stats,
    avgPrice: stats?.avg,
    dropPercent: opportunity?.dropPercent,
    severity: opportunity?.severity,
    opportunityType: opportunity?.type,
  };
}

async function generateWithAI(ctx) {
  const prompt = `Você é um assistente especialista em passagens aéreas e viagens no Brasil.
Gere uma mensagem de alerta de oportunidade de passagem aérea. A mensagem deve ser:
- Direta, empolgante mas não exagerada
- Baseada em dados reais (não invente informações além do fornecido)
- Em português brasileiro informal
- Com emojis relevantes (mas com moderação)
- Máximo 4 parágrafos curtos

DADOS DA OPORTUNIDADE:
- Rota: ${ctx.origin} → ${ctx.destination}
- Preço atual: ${ctx.formattedPrice}
- Companhia: ${ctx.airline}
- Escalas: ${ctx.stops === 0 ? 'voo direto' : `${ctx.stops} escala(s)`}
- Data: ${ctx.formattedDate}
- Tipo de oportunidade: ${ctx.opportunityType}
- Queda de preço: ${ctx.dropPercent ? Math.round(ctx.dropPercent) + '%' : 'N/A'}
- Preço médio histórico: ${ctx.avgPrice ? 'R$ ' + Math.round(ctx.avgPrice) : 'N/A'}
- Severidade: ${ctx.severity}

Inclua no final: "${ctx.deep_link}" como link para compra.

Responda APENAS com a mensagem, sem título ou introdução.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 400,
    temperature: 0.8,
  });

  return response.choices[0].message.content.trim();
}

function generateWithTemplate(ctx) {
  const {
    origin, destination, formattedPrice, airline, stops,
    formattedDate, deep_link, dropPercent, stats, severity,
    opportunityType, avgPrice
  } = ctx;

  const emojis = {
    high: '🔥',
    medium: '✈️',
    low: '💡',
  };

  const urgencyTexts = {
    high: 'Recomendamos comprar agora — promoções assim somem rápido.',
    medium: 'Vale a pena garantir logo, os preços tendem a subir com a aproximação da data.',
    low: 'Boa oportunidade para planejar sua viagem com antecedência.',
  };

  const emoji = emojis[severity] || '✈️';
  const urgency = urgencyTexts[severity] || urgencyTexts.low;
  const stopsText = stops === 0 ? 'voo direto' : `${stops} escala${stops > 1 ? 's' : ''}`;
  const dropText = dropPercent ? `${Math.round(dropPercent)}% abaixo da média` : '';
  const avgText = avgPrice ? ` (média histórica: R$ ${Math.round(avgPrice)})` : '';

  const typeMessages = {
    historical_low: `Este é o MENOR preço que registramos para esta rota nos últimos 30 dias${avgText}.`,
    below_average: `Esse preço está ${dropText}${avgText} — uma oportunidade clara de economia.`,
    price_drop: `O preço caiu ${dropText} desde ontem — claramente uma promoção temporária.`,
    below_median: `Preço bem abaixo da mediana histórica para esta rota${avgText}.`,
  };

  const typeMsg = typeMessages[opportunityType] || typeMessages.below_average;

  return `${emoji} **Oportunidade: ${origin} → ${destination}**

**${formattedPrice}** com ${airline} (${stopsText}) · ${formattedDate}

${typeMsg}

${urgency}

👉 [Ver passagem e comprar](${deep_link})`;
}

/**
 * Interpreta input vago do usuário (ex: "quero praia barata em julho")
 */
async function interpretUserInput(input) {
  if (!openai) {
    return { success: false, message: 'IA não configurada — use campos diretos.' };
  }

  const prompt = `O usuário quer configurar um alerta de passagem aérea. Interprete o pedido e extraia as informações.

Input do usuário: "${input}"

Responda APENAS com um JSON válido com esta estrutura:
{
  "origin": "código IATA ou null",
  "destination": "código IATA ou 'FLEXIBLE' para qualquer destino",
  "destination_label": "nome amigável do destino",
  "travel_date": "YYYY-MM-DD ou null se não especificado",
  "preference": "cheapest | fastest | best_value",
  "is_discovery_mode": true/false,
  "interpretation": "explicação em uma frase do que o usuário quer"
}

Aeroportos principais do Brasil:
GRU=São Paulo, GIG=Rio de Janeiro, BSB=Brasília, SSA=Salvador,
REC=Recife, FOR=Fortaleza, CWB=Curitiba, POA=Porto Alegre,
FLN=Florianópolis, BEL=Belém, MAO=Manaus

Se o usuário mencionar "praia" sem especificar, use destinos como SSA, REC, FOR, FLN.
Se mencionar "qualquer destino" ou "onde for mais barato", use is_discovery_mode: true.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.3,
    });

    const content = response.choices[0].message.content.trim();
    const json = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
    return { success: true, ...json };
  } catch (err) {
    return { success: false, message: 'Não consegui interpretar. Use os campos diretos.' };
  }
}

module.exports = { generateAlertMessage, interpretUserInput };
