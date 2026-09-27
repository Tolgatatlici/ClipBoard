export interface UploadTarget {
  url: string;
  headers: Record<string, string>;
}

/** Şifreli dosya blob'larının saklandığı yer. Blob'lar sunucu için anlamsız baytlardır. */
export interface FileStorage {
  /** Tarayıcının doğrudan yükleme yapacağı, `size` bayta kilitli, süreli bir hedef. */
  uploadTarget(fileId: string, size: number, expiresInSeconds: number): Promise<UploadTarget>;
  /** Süreli indirme adresi. */
  downloadUrl(fileId: string, expiresInSeconds: number): Promise<string>;
  /** Yüklenmiş dosyanın boyutu; yoksa `null`. */
  size(fileId: string): Promise<number | null>;
  delete(fileId: string): Promise<void>;
}
