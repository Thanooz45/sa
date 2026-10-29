import { URL } from 'url';
import dns from 'dns/promises';
import ipaddr from 'ipaddr.js';

// Blocked hostnames / cloud metadata
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'instance-data',
  '169.254.169.254'
]);

/**
 * Checks whether an IP address is private, loopback, link-local, or otherwise restricted.
 * @param {string} ipStr 
 * @returns {boolean} true if private/restricted
 */
export function isPrivateOrRestrictedIp(ipStr) {
  try {
    let addr = ipaddr.parse(ipStr);

    // If it's an IPv4-mapped IPv6 address (e.g. ::ffff:127.0.0.1), extract IPv4
    if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
      addr = addr.toIPv4Address();
    }

    const range = addr.range();
    const restrictedRanges = [
      'unspecified',
      'broadcast',
      'linkLocal',
      'loopback',
      'private',
      'reserved',
      'carrierGradeNat',
      'uniqueLocal'
    ];

    if (restrictedRanges.includes(range)) {
      return true;
    }

    // Additional check for 0.0.0.0 or 127.x.x.x or 169.254.x.x
    const octets = addr.toByteArray();
    if (addr.kind() === 'ipv4') {
      if (octets[0] === 0 || octets[0] === 127 || octets[0] === 10) return true;
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
      if (octets[0] === 192 && octets[1] === 168) return true;
      if (octets[0] === 169 && octets[1] === 254) return true;
    }

    return false;
  } catch (err) {
    // If not a valid parseable IP, consider safe only after DNS resolution
    return true;
  }
}

/**
 * Identify target source category from parsed URL
 * @param {URL} parsedUrl 
 * @returns {string} 'internet_archive' | 'eporner' | 'pornhub' | 'xhamster' | 'direct' | 'unsupported'
 */
export function identifySource(parsedUrl) {
  const host = parsedUrl.hostname.toLowerCase();
  const path = parsedUrl.pathname.toLowerCase();

  // Direct video file extensions
  const isDirectExt = (
    path.endsWith('.mp4') ||
    path.endsWith('.webm') ||
    path.endsWith('.m4v') ||
    path.endsWith('.ogv')
  );

  // Internet Archive item pages
  if (host === 'archive.org' || host.endsWith('.archive.org')) {
    if (path.includes('/details/')) {
      return 'internet_archive';
    }
    if (isDirectExt) {
      return 'direct';
    }
    return 'internet_archive';
  }

  // Eporner
  if (host === 'eporner.com' || host.endsWith('.eporner.com')) {
    return 'eporner';
  }

  // Pornhub
  if (host === 'pornhub.com' || host.endsWith('.pornhub.com') || host === 'pornhubpremium.com') {
    return 'pornhub';
  }

  // XHamster
  if (
    host === 'xhamster.com' ||
    host.endsWith('.xhamster.com') ||
    host === 'xhamster.desi' ||
    host.endsWith('.xhamster.desi') ||
    host.includes('xhamster') ||
    host.includes('xhwide')
  ) {
    return 'xhamster';
  }

  // General direct video URLs
  if (isDirectExt) {
    return 'direct';
  }

  return 'unsupported';
}

/**
 * Validates a video URL for security and schema
 * @param {string} rawUrl 
 * @returns {Promise<{ valid: boolean, parsedUrl?: URL, source?: string, error?: string, errorCode?: string }>}
 */
export async function validateVideoUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return {
      valid: false,
      error: 'Paste a video URL to continue.',
      errorCode: 'EMPTY_INPUT'
    };
  }

  let trimmed = rawUrl.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (e) {
    return {
      valid: false,
      error: 'Enter a valid HTTP or HTTPS URL.',
      errorCode: 'INVALID_URL'
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: 'Enter a valid HTTP or HTTPS URL.',
      errorCode: 'INVALID_PROTOCOL'
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Hostname string checks
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.test') ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.startsWith('127.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('169.254.')
  ) {
    return {
      valid: false,
      error: 'This source is not supported yet.',
      errorCode: 'SSRF_BLOCKED_HOST'
    };
  }

  // DNS resolution & IP check to prevent SSRF and DNS rebinding
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return {
        valid: false,
        error: 'The video could not be accessed.',
        errorCode: 'DNS_RESOLUTION_EMPTY'
      };
    }

    for (const addr of addresses) {
      if (isPrivateOrRestrictedIp(addr.address)) {
        return {
          valid: false,
          error: 'This source is not supported yet.',
          errorCode: 'SSRF_PRIVATE_IP'
        };
      }
    }
  } catch (err) {
    return {
      valid: false,
      error: 'The video could not be accessed.',
      errorCode: 'DNS_LOOKUP_FAILED'
    };
  }

  const source = identifySource(parsed);

  return {
    valid: true,
    parsedUrl: parsed,
    source
  };
}
