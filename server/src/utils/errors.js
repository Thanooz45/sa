export const ERROR_MESSAGES = {
  EMPTY_INPUT: 'Paste a video URL to continue.',
  INVALID_URL: 'Enter a valid HTTP or HTTPS URL.',
  INVALID_PROTOCOL: 'Enter a valid HTTP or HTTPS URL.',
  UNSUPPORTED_SOURCE: 'This source is not supported yet.',
  SSRF_BLOCKED_HOST: 'This source is not supported yet.',
  SSRF_PRIVATE_IP: 'This source is not supported yet.',
  DNS_LOOKUP_FAILED: 'The video could not be accessed.',
  DNS_RESOLUTION_EMPTY: 'The video could not be accessed.',
  VIDEO_UNAVAILABLE: 'The video could not be accessed.',
  METADATA_FAILURE: 'Could not retrieve video information.',
  NO_PERMITTED_DOWNLOAD: 'No authorized download method is available.',
  UNSUPPORTED_FORMAT: 'The selected format is unavailable.',
  FILE_TOO_LARGE: 'This file exceeds the configured size limit.',
  TIMEOUT: 'The request took too long. Please try again.',
  NETWORK_FAILURE: 'The connection failed. Please retry.',
  DOWNLOAD_INTERRUPTED: 'The download did not complete.',
  TEMPORARY_SOURCE_FAILURE: 'The source is temporarily unavailable.',
  RATE_LIMIT_EXCEEDED: 'The source is temporarily unavailable.'
};

export class AppError extends Error {
  /**
   * @param {keyof typeof ERROR_MESSAGES} errorCode 
   * @param {number} statusCode 
   * @param {string} [technicalDetails] 
   */
  constructor(errorCode, statusCode = 400, technicalDetails = '') {
    const message = ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.METADATA_FAILURE;
    super(message);
    this.name = 'AppError';
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.technicalDetails = technicalDetails;
  }
}
