import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import {
  generateBakongKhqrPayload,
  isValidBakongAccountId,
  parseBakongKhqr,
  type BakongKhqrInput,
} from './src/utils/bakongKhqr.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '8mb' }));

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'xaiwork-pos' });
});

app.post('/api/ai/assistant', async (req, res) => {
  try {
    const { question, language, branchSummary } = req.body as {
      question: string;
      language?: string;
      branchSummary: {
        branchName: string;
        todayNetSalesUsd: number;
        todayBillsCount: number;
        avgBillUsd: number;
        paymentBreakdown: Record<string, number>;
        topItems: { name: string; qty: number; revenueUsd: number }[];
        weeklyDailyHistory: { date: string; netSalesUsd: number; bills: number }[];
      };
    };

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      const top = branchSummary.topItems[0];
      const fallback = `Based on ${branchSummary.branchName}'s real figures: today's net sales are $${branchSummary.todayNetSalesUsd.toFixed(2)} across ${branchSummary.todayBillsCount} bills (avg $${branchSummary.avgBillUsd.toFixed(2)}). Top seller: ${top ? `${top.name} (${top.qty} sold, $${top.revenueUsd.toFixed(2)})` : 'N/A'}.`;
      return res.json({ answer: fallback, source: 'local-summary' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Branch totals (anonymized, no guest PII): ${JSON.stringify(branchSummary)}\n\nOwner question (${language || 'en'}): ${question}`,
      config: {
        systemInstruction:
          'You are the XAIWork POS owner analytics assistant for cafés and restaurants in Cambodia. Answer concisely using ONLY the provided branch numbers in USD and KHR (1 USD = 4,100 KHR). Match the language of the question (English, Khmer, or Vietnamese). Never invent metrics not supported by the summary.',
      },
    });

    return res.json({
      answer: response.text ?? 'Unable to generate an answer right now.',
      source: 'gemini',
    });
  } catch (error) {
    console.error('AI assistant error:', error);
    return res.status(500).json({ error: 'AI assistant request failed' });
  }
});

app.post('/api/ai/menu-import', async (req, res) => {
  try {
    const { rawText, imageBase64, mimeType } = req.body as {
      rawText?: string;
      imageBase64?: string;
      mimeType?: string;
    };

    if (!rawText && !imageBase64) {
      return res.status(400).json({ error: 'Provide menu text or a menu photo.' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      // Deterministic parser for pasted CSV/tab-delimited Excel rows
      const lines = (rawText ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const parsed = lines.map((line) => {
        const parts = line.split(/[,\t|]+/).map((p) => p.trim());
        const nameEn = parts[0] || 'Menu item';
        const priceUsd = Math.max(0.5, parseFloat((parts[1] || '4.00').replace(/[^0-9.]/g, '')) || 4.0);
        const category = parts[2] || 'Main dishes';
        return {
          nameEn,
          nameKh: nameEn,
          nameVi: nameEn,
          category,
          priceUsd,
          station: category.toLowerCase().includes('coffee') || category.toLowerCase().includes('drink') ? 'bar' : 'kitchen',
        };
      });
      return res.json({ items: parsed, source: 'local-parser' });
    }

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: imageBase64,
        },
      });
    }
    parts.push({
      text: rawText
        ? `Extract dishes, prices in USD, categories, and Khmer/Vietnamese translations from this menu text:\n${rawText}`
        : 'Extract all dishes, prices in USD, categories, and Khmer/Vietnamese translations from this restaurant menu image.',
    });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              nameEn: { type: Type.STRING },
              nameKh: { type: Type.STRING },
              nameVi: { type: Type.STRING },
              category: { type: Type.STRING },
              priceUsd: { type: Type.NUMBER },
              station: { type: Type.STRING },
            },
            required: ['nameEn', 'nameKh', 'nameVi', 'category', 'priceUsd', 'station'],
          },
        },
      },
    });

    const items = JSON.parse((response.text ?? '[]').trim());
    return res.json({ items, source: 'gemini' });
  } catch (error) {
    console.error('Menu import AI error:', error);
    return res.status(500).json({ error: 'Failed to parse menu items.' });
  }
});

app.post('/api/ai/promo-writer', async (req, res) => {
  try {
    const { promoName, targetAudience, discountDetail } = req.body as {
      promoName: string;
      targetAudience: string;
      discountDetail: string;
    };

    const ai = getGeminiClient();
    if (!ai) {
      return res.json({
        message: `Lotus Café BKK1: ${promoName} (${discountDetail})! Show this Telegram message on your next visit.\nសួស្តី! ប្រូម៉ូសិនពិសេស ${promoName} (${discountDetail}) នៅ Lotus Café BKK1។`,
        suggestedSendTime: '11:15 AM (before lunch rush)',
        source: 'template',
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Write a short, friendly Telegram promotion message in BOTH English and Khmer for a Cambodian café/restaurant.\nPromo: ${promoName}\nOffer: ${discountDetail}\nAudience: ${targetAudience}\nReturn plain JSON with keys "message" and "suggestedSendTime".`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            message: { type: Type.STRING },
            suggestedSendTime: { type: Type.STRING },
          },
          required: ['message', 'suggestedSendTime'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    return res.json({ ...parsed, source: 'gemini' });
  } catch (error) {
    console.error('Promo writer error:', error);
    return res.status(500).json({ error: 'Failed to draft promotion message.' });
  }
});

function getBakongToken(): string | null {
  const raw = process.env.BAKONG_API_TOKEN;
  if (!raw) return null;
  const tok = raw.trim().replace(/^["']|["']$/g, '').trim();
  if (!tok || tok === 'MY_BAKONG_API_TOKEN' || tok.length < 8) return null;
  return tok;
}

app.post('/api/bakong/generate-qr', (req, res) => {
  try {
    const body = req.body as Partial<BakongKhqrInput>;
    if (!body?.bakongAccountId || !isValidBakongAccountId(body.bakongAccountId)) {
      return res.status(400).json({ error: 'Valid Bakong Account ID (e.g. name@abaa) is required.' });
    }
    const result = generateBakongKhqrPayload({
      accountType: body.accountType === 'merchant' ? 'merchant' : 'individual',
      bakongAccountId: body.bakongAccountId,
      merchantId: body.merchantId,
      acquiringBank: body.acquiringBank,
      merchantName: body.merchantName || 'XAIWork Merchant',
      merchantCity: body.merchantCity || 'Phnom Penh',
      currency: body.currency === 'KHR' ? 'KHR' : 'USD',
      amount: typeof body.amount === 'number' ? body.amount : 0,
      billNumber: body.billNumber,
      storeLabel: body.storeLabel,
      terminalLabel: body.terminalLabel,
      mcc: body.mcc,
      isStatic: Boolean(body.isStatic),
    });
    return res.json({
      ...result,
      parsed: parseBakongKhqr(result.qrString),
      mode: getBakongToken() ? 'live' : 'sandbox',
    });
  } catch (error) {
    console.error('Bakong generate-qr error:', error);
    return res.status(500).json({ error: 'Failed to generate KHQR payload.' });
  }
});

app.post('/api/bakong/verify-account', async (req, res) => {
  try {
    const { accountId } = req.body as { accountId?: string };
    const cleanId = (accountId || '').trim();
    if (!isValidBakongAccountId(cleanId)) {
      return res.status(400).json({
        valid: false,
        error: 'Invalid Bakong ID format. Expected format like account@abaa or shop@aclb.',
      });
    }

    const token = getBakongToken();
    if (!token) {
      const bankCode = cleanId.split('@')[1]?.toUpperCase() || 'BAKONG';
      return res.json({
        valid: true,
        accountId: cleanId,
        bankCode,
        mode: 'sandbox',
        message: `Format verified (${bankCode}). KHQR Sandbox mode active (BAKONG_API_TOKEN is optional/empty).`,
      });
    }

    const apiRes = await fetch('https://api-bakong.nbc.gov.kh/v1/check_bakong_account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ accountId: cleanId }),
    });
    const data = (await apiRes.json()) as {
      responseCode?: number;
      responseMessage?: string;
      data?: Record<string, unknown>;
    };
    const ok = apiRes.ok && data.responseCode === 0;
    return res.json({
      valid: ok,
      accountId: cleanId,
      mode: 'live',
      message: data.responseMessage || (ok ? 'Bakong account active.' : 'Account not found on NBC Bakong.'),
      data: data.data ?? null,
    });
  } catch (error) {
    console.error('Bakong verify-account error:', error);
    return res.status(500).json({ valid: false, error: 'Failed to verify Bakong account.' });
  }
});

app.post('/api/bakong/check-transaction', async (req, res) => {
  try {
    const { md5, simulatePaid } = req.body as { md5?: string; simulatePaid?: boolean };
    if (!md5 || !/^[a-f0-9]{32}$/i.test(md5)) {
      return res.status(400).json({ error: 'Valid 32-character MD5 hash is required.' });
    }

    const token = getBakongToken();
    if (Boolean(simulatePaid) || !token) {
      const paid = Boolean(simulatePaid);
      return res.json({
        paid,
        status: paid ? 'PAID_SANDBOX' : 'PENDING',
        md5: md5.toLowerCase(),
        transactionRef: paid ? `KHQR-${md5.slice(0, 8).toUpperCase()}` : null,
        mode: 'sandbox',
        message: paid
          ? 'Sandbox payment confirmed via Bakong MD5 reference.'
          : 'Awaiting customer scan in Bakong / banking app (sandbox mode).',
      });
    }

    const apiRes = await fetch('https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ md5: md5.toLowerCase() }),
    });
    const data = (await apiRes.json()) as {
      responseCode?: number;
      responseMessage?: string;
      data?: { hash?: string; fromAccountId?: string; toAccountId?: string; amount?: number; currency?: string };
    };
    const paid = apiRes.ok && data.responseCode === 0 && Boolean(data.data);
    return res.json({
      paid,
      status: paid ? 'PAID' : 'PENDING',
      md5: md5.toLowerCase(),
      transactionRef: data.data?.hash || null,
      mode: 'live',
      message: data.responseMessage || (paid ? 'Payment received via Bakong.' : 'Transaction pending.'),
      data: data.data ?? null,
    });
  } catch (error) {
    console.error('Bakong check-transaction error:', error);
    return res.status(500).json({ error: 'Failed to check Bakong transaction status.' });
  }
});

async function startServer() {
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`XAIWork POS server running on http://0.0.0.0:${port}`);
  });
}

void startServer();
