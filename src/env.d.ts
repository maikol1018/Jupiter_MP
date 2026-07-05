declare namespace NodeJS {
  interface ProcessEnv {
    TARO_ENV?: 'weapp' | 'h5' | string;
    JUPITER_API_BASE?: string;
    JUPITER_API_PROXY_TARGET?: string;
    JUPITER_AUTH_KEY?: string;
    JUPITER_SHARE_URL?: string;
  }
}

declare module 'qrcode' {
  const QRCode: {
    toDataURL(text: string, options?: Record<string, any>): Promise<string>;
  };
  export default QRCode;
}

declare const process: {
  env: NodeJS.ProcessEnv;
};