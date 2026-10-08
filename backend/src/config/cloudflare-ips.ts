/**
 * The address ranges Cloudflare's proxies connect from, as published at
 * https://www.cloudflare.com/ips/ (read on 2026-10-08, 15 IPv4 and 7 IPv6
 * ranges; the same list as https://api.cloudflare.com/client/v4/ips).
 *
 * `TRUST_PROXY` knows them by the name `cloudflare`, and they are part of its
 * default: behind Cloudflare the address of a caller arrives in
 * `X-Forwarded-For`, and it is only believed when the hop that reports it is one
 * of these.
 *
 * Cloudflare changes the list rarely and announces it. A range that is missing
 * here is not dangerous, only wrong: callers behind it are then counted under the
 * address of that proxy and share one rate limit – compare the list with the
 * page above when that shows up in the `429` log lines.
 */
export const CLOUDFLARE_PROXY_RANGES: readonly string[] = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];
