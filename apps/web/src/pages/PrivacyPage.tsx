import { Link } from 'react-router';
import { Prose } from '../components/Prose';
import { SITE } from '../lib/site';
import { useTitle } from '../lib/use-title';

// Not: Bu metin bir şablondur; yayına almadan önce bir hukukçuya gözden geçirtin.
export function PrivacyPage() {
  useTitle('Gizlilik politikası');
  return (
    <Prose title="Gizlilik politikası">
      <p className="muted">Son güncelleme: {SITE.legalUpdated}</p>
      <p>
        Bu politika, {SITE.operator} (“biz”) tarafından işletilen {SITE.name} hizmetinde hangi
        verilerin işlendiğini açıklar. 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ve
        uygulanabildiği ölçüde Avrupa Birliği Genel Veri Koruma Tüzüğü (GDPR) kapsamında veri
        sorumlusu {SITE.operator}dır.
      </p>

      <h2>Paylaştığınız içerik</h2>
      <p>
        Paylaştığınız metin ve dosyalar, sunucuya gönderilmeden önce tarayıcınızda şifrelenir.
        Şifreyi çözecek anahtar yalnızca sizde ve içeriği paylaştığınız kişilerdedir; biz içeriği
        okuyamayız. Şifreli içerik, seçtiğiniz süre dolduğunda ya da siz sildiğinizde otomatik
        olarak silinir. Dosya adı ve türü de şifrelenir.
      </p>

      <h2>Teknik veriler</h2>
      <ul>
        <li>
          <strong>IP adresi:</strong> Kötüye kullanımı ve aşırı yükü önlemek için en fazla birkaç
          dakika süren sayaçlarda tutulur. İçerikle ilişkilendirilmez ve erişim günlüklerine
          yazılmaz.
        </li>
        <li>
          <strong>Hizmet ölçümleri:</strong> Toplam paylaşım sayısı gibi anonim, kişiyle
          ilişkilendirilemeyen sayılar.
        </li>
        <li>
          <strong>Tarayıcı depolaması:</strong> Oluşturduğunuz içerikleri silebilmeniz için silme
          anahtarları yalnızca kendi tarayıcınızda, içerik süresi dolana kadar tutulur. Çerez ya da
          izleme aracı kullanmıyoruz.
        </li>
      </ul>

      <h2>Kötüye kullanım bildirimleri</h2>
      <p>
        <Link to="/bildir">Bildirim formu</Link> ile gönderdiğiniz bilgiler (bildirilen link,
        açıklama ve isteğe bağlı iletişim bilginiz) incelenmek üzere 30 gün saklanır.
      </p>

      <h2>Üçüncü taraflar</h2>
      <p>
        Hizmet; barındırma, depolama ve (etkinse) hata takibi sağlayıcıları üzerinde çalışır. Bu
        sağlayıcılar yalnızca şifreli içeriğe ve yukarıdaki teknik verilere erişebilir. Hata
        raporlarından istek adresi, gövde ve IP gibi bilgiler gönderilmeden önce çıkarılır.
      </p>

      <h2>Haklarınız</h2>
      <p>
        KVKK’nın 11. maddesi ve GDPR kapsamındaki haklarınız (bilgi talep etme, düzeltme, silme,
        itiraz vb.) için <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> adresine
        yazabilirsiniz. Hesap sistemi olmadığı ve içerik şifreli olduğu için çoğu durumda sizi
        tanımlayabilecek veri tutmadığımızı hatırlatırız.
      </p>
    </Prose>
  );
}
