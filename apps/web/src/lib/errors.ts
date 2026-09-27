import { DecryptionError, WrongPasswordError } from '@clipboard/shared';
import { ApiError, NetworkError } from './api';
import { FileTooLargeError } from './clips';

/** Hatayı kullanıcıya gösterilecek Türkçe mesaja çevirir. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.body.error) {
      case 'not_found':
        return 'İçerik bulunamadı. Süresi dolmuş, silinmiş ya da tek okumalık olup zaten açılmış olabilir.';
      case 'invalid_token':
        return error.body.remainingAttempts !== undefined
          ? `Kod hatalı. Kalan deneme hakkı: ${error.body.remainingAttempts}.`
          : 'Link geçersiz. Eksik kopyalanmış olabilir.';
      case 'code_locked':
        return 'Çok fazla hatalı deneme yapıldığı için bu içerik artık kodla açılamıyor. Paylaşım linkini veya QR kodu kullanın.';
      case 'rate_limited':
        return 'Çok fazla istek gönderildi. Lütfen biraz bekleyip tekrar deneyin.';
      case 'file_missing':
        return 'Dosya yüklemesi tamamlanamadı. Lütfen tekrar deneyin.';
      case 'invalid_request':
        return 'İstek geçersiz. Sayfayı yenileyip tekrar deneyin.';
      default:
        return 'Sunucuda bir hata oluştu. Lütfen tekrar deneyin.';
    }
  }
  if (error instanceof NetworkError) {
    return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.';
  }
  if (error instanceof WrongPasswordError) {
    return 'Parola yanlış.';
  }
  if (error instanceof FileTooLargeError) {
    return 'Dosya çok büyük. En fazla 25 MB paylaşabilirsiniz.';
  }
  if (error instanceof DecryptionError) {
    return 'İçerik çözülemedi. Link bozuk ya da eksik kopyalanmış olabilir.';
  }
  return 'Beklenmeyen bir hata oluştu.';
}
