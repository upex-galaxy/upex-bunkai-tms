import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { qaConfig } from './qa-config';

// The /qa guide links a public CA certificate and states its issuer, expiry and
// fingerprint (BK-49 Stage 5). These tests tie those claims to the file that is
// actually served, so replacing the .crt without the config (or the reverse)
// fails here instead of teaching students a wrong fingerprint.
const { tlsCa } = qaConfig.db;
const pem = readFileSync(join(process.cwd(), 'public', tlsCa.href), 'utf8');

describe('/qa database CA certificate', () => {
  test('the link points into public/qa and names the served file', () => {
    expect(tlsCa.href).toBe(`/qa/${tlsCa.fileName}`);
  });

  test('the file is exactly one public certificate and no private key', () => {
    expect(pem.match(/-----BEGIN CERTIFICATE-----/g)?.length).toBe(1);
    expect(pem).not.toContain('PRIVATE KEY');
  });

  test('the stated issuer, fingerprint and expiry match the file', () => {
    const cert = new X509Certificate(pem);
    expect(cert.subject).toContain(`CN=${tlsCa.issuer}`);
    expect(cert.issuer).toContain(`CN=${tlsCa.issuer}`);
    expect(cert.fingerprint256).toBe(tlsCa.sha256);
    expect(new Date(cert.validTo).toISOString().slice(0, 10)).toBe(tlsCa.validUntil);
  });

  test('the guide documents the last resort as disabling verification', () => {
    expect(tlsCa.lastResort).toContain('rejectUnauthorized: false');
    expect(tlsCa.lastResort).toContain('APAGA');
  });
});
