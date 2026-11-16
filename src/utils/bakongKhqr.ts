export type KhqrCurrency = 'USD' | 'KHR';
export type KhqrAccountType = 'individual' | 'merchant';

export interface BakongKhqrInput {
  accountType?: KhqrAccountType;
  bakongAccountId: string;
  merchantId?: string;
  acquiringBank?: string;
  merchantName: string;
  merchantCity?: string;
  currency: KhqrCurrency;
  amount?: number;
  billNumber?: string;
  storeLabel?: string;
  terminalLabel?: string;
  mcc?: string;
  isStatic?: boolean;
}

export interface BakongKhqrResult {
  qrString: string;
  md5: string;
  crc: string;
  currencyCode: '840' | '116';
  formattedAmount: string;
  accountType: KhqrAccountType;
}

export interface ParsedKhqrResult {
  validFormat: boolean;
  crcValid: boolean;
  payloadFormat?: string;
  initiationMethod?: 'static' | 'dynamic';
  accountType?: KhqrAccountType;
  bakongAccountId?: string;
  merchantId?: string;
  acquiringBank?: string;
  mcc?: string;
  currency?: KhqrCurrency;
  amount?: string;
  countryCode?: string;
  merchantName?: string;
  merchantCity?: string;
  billNumber?: string;
  storeLabel?: string;
  terminalLabel?: string;
  crc?: string;
  tags: Record<string, string>;
}

function tlv(tag: string, value: string): string {
  const byteLen = value.length;
  const lenStr = String(byteLen).padStart(2, '0');
  return `${tag}${lenStr}${value}`;
}

function sanitizeAscii(input: string, maxLen: number, fallback: string): string {
  const cleaned = input
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, maxLen);
  return cleaned || fallback;
}

export function isValidBakongAccountId(id: string): boolean {
  const trimmed = id.trim();
  if (trimmed.length < 4 || trimmed.length > 64) return false;
  return /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/.test(trimmed);
}

export function normalizeOptionalKhqrAccountId(id?: string | null): string {
  return (id ?? '').trim();
}

export function isMerchantKhqrConfigured(id?: string | null): boolean {
  const normalized = normalizeOptionalKhqrAccountId(id);
  if (!normalized) return false;
  return isValidBakongAccountId(normalized);
}

/**
 * CRC-16/CCITT-FALSE (polynomial 0x1021, initial value 0xFFFF, no reflection, no final XOR)
 * Required by EMVCo Merchant-Presented QR / NBC Bakong KHQR tag 63.
 */
export function crc16CcittFalse(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i += 1) {
    crc ^= (input.charCodeAt(i) & 0xff) << 8;
    for (let j = 0; j < 8; j += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Pure TypeScript UTF-8 MD5 hex digest matching Node crypto.createHash('md5')
 * Used by Bakong Open API check_transaction_by_md5.
 */
export function md5Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;

  const padLen = ((56 - ((bytes.length + 1) % 64)) + 64) % 64;
  const totalLen = bytes.length + 1 + padLen + 8;
  const buf = new Uint8Array(totalLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;

  const view = new DataView(buf.buffer);
  view.setUint32(totalLen - 8, bitLen >>> 0, true);
  view.setUint32(totalLen - 4, Math.floor(bitLen / 0x100000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i += 1) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  }

  for (let offset = 0; offset < totalLen; offset += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j += 1) {
      M[j] = view.getUint32(offset + j * 4, true);
    }

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i += 1) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }

      F = (F + A + K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      const shift = s[i];
      const rotated = ((F << shift) | (F >>> (32 - shift))) >>> 0;
      B = (B + rotated) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);

  return Array.from(out)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateBakongKhqrPayload(input: BakongKhqrInput): BakongKhqrResult {
  const accountType: KhqrAccountType = input.accountType || 'individual';
  const bakongId = sanitizeAscii(input.bakongAccountId, 48, 'merchant@abaa');
  const merchantName = sanitizeAscii(input.merchantName, 25, 'XAIWork Merchant');
  const merchantCity = sanitizeAscii(input.merchantCity || 'Phnom Penh', 15, 'Phnom Penh');
  const mcc = /^\d{4}$/.test(input.mcc || '') ? String(input.mcc) : '5812';
  const currencyCode = input.currency === 'KHR' ? '116' : '840';

  const rawAmount = typeof input.amount === 'number' && Number.isFinite(input.amount) ? input.amount : 0;
  const hasAmount = !input.isStatic && rawAmount > 0;
  const formattedAmount = hasAmount
    ? input.currency === 'KHR'
      ? String(Math.round(rawAmount))
      : rawAmount.toFixed(2)
    : '';

  const initiationMethod = hasAmount ? '12' : '11';

  let merchantAccountSub = tlv('00', bakongId);
  if (accountType === 'merchant') {
    const mId = sanitizeAscii(input.merchantId || '000001', 32, '000001');
    const acq = sanitizeAscii(input.acquiringBank || 'ABA Bank', 32, 'ABA Bank');
    merchantAccountSub += tlv('01', mId) + tlv('02', acq);
  } else if (input.merchantId) {
    merchantAccountSub += tlv('01', sanitizeAscii(input.merchantId, 32, ''));
  }

  const merchantAccountTag = accountType === 'merchant' ? '30' : '29';

  let additionalDataSub = '';
  if (input.billNumber) {
    additionalDataSub += tlv('01', sanitizeAscii(input.billNumber, 25, ''));
  }
  if (input.storeLabel) {
    additionalDataSub += tlv('03', sanitizeAscii(input.storeLabel, 25, ''));
  }
  if (input.terminalLabel) {
    additionalDataSub += tlv('07', sanitizeAscii(input.terminalLabel, 25, ''));
  }

  const body =
    tlv('00', '01') +
    tlv('01', initiationMethod) +
    tlv(merchantAccountTag, merchantAccountSub) +
    tlv('52', mcc) +
    tlv('53', currencyCode) +
    (hasAmount ? tlv('54', formattedAmount) : '') +
    tlv('58', 'KH') +
    tlv('59', merchantName) +
    tlv('60', merchantCity) +
    (additionalDataSub ? tlv('62', additionalDataSub) : '');

  const payloadWithCrcTag = `${body}6304`;
  const crc = crc16CcittFalse(payloadWithCrcTag);
  const qrString = `${payloadWithCrcTag}${crc}`;
  const md5 = md5Hex(qrString);

  return {
    qrString,
    md5,
    crc,
    currencyCode,
    formattedAmount,
    accountType,
  };
}

function parseTlvMap(raw: string): Record<string, string> {
  const tags: Record<string, string> = {};
  let idx = 0;
  while (idx + 4 <= raw.length) {
    const tag = raw.slice(idx, idx + 2);
    const lenStr = raw.slice(idx + 2, idx + 4);
    const len = Number(lenStr);
    if (!/^\d{2}$/.test(lenStr) || !Number.isFinite(len) || idx + 4 + len > raw.length) {
      break;
    }
    const val = raw.slice(idx + 4, idx + 4 + len);
    tags[tag] = val;
    idx += 4 + len;
  }
  return tags;
}

export function parseBakongKhqr(qrString: string): ParsedKhqrResult {
  const trimmed = qrString.trim();
  const tags = parseTlvMap(trimmed);
  const validFormat = Boolean(tags['00'] === '01' && (tags['29'] || tags['30']) && tags['63']?.length === 4);

  let crcValid = false;
  if (trimmed.length >= 8 && tags['63']) {
    const crcIdx = trimmed.lastIndexOf('6304');
    if (crcIdx >= 0 && crcIdx + 8 === trimmed.length) {
      const expectedCrc = crc16CcittFalse(trimmed.slice(0, crcIdx + 4));
      crcValid = expectedCrc === tags['63'];
    }
  }

  const accountType: KhqrAccountType | undefined = tags['30']
    ? 'merchant'
    : tags['29']
      ? 'individual'
      : undefined;
  const acctSub = accountType === 'merchant' ? parseTlvMap(tags['30']) : accountType === 'individual' ? parseTlvMap(tags['29']) : {};
  const addSub = tags['62'] ? parseTlvMap(tags['62']) : {};

  return {
    validFormat,
    crcValid,
    payloadFormat: tags['00'],
    initiationMethod: tags['01'] === '11' ? 'static' : tags['01'] === '12' ? 'dynamic' : undefined,
    accountType,
    bakongAccountId: acctSub['00'],
    merchantId: acctSub['01'],
    acquiringBank: acctSub['02'],
    mcc: tags['52'],
    currency: tags['53'] === '116' ? 'KHR' : tags['53'] === '840' ? 'USD' : undefined,
    amount: tags['54'],
    countryCode: tags['58'],
    merchantName: tags['59'],
    merchantCity: tags['60'],
    billNumber: addSub['01'],
    storeLabel: addSub['03'],
    terminalLabel: addSub['07'],
    crc: tags['63'],
    tags,
  };
}
