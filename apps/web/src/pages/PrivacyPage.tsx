import { Link } from 'react-router';
import { Prose } from '../components/Prose';
import { SITE } from '../lib/site';
import { useI18n } from '../i18n/use-i18n';
import { useTitle } from '../lib/use-title';

// Not: Bu metin bir şablondur; yayına almadan önce bir hukukçuya gözden geçirtin.
export function PrivacyPage() {
  useTitle('titles.privacy');
  return useI18n().lang === 'en' ? <PrivacyEn /> : <PrivacyTr />;
}

function PrivacyTr() {
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

function PrivacyEn() {
  return (
    <Prose title="Privacy policy">
      <p className="muted">Last updated: {SITE.legalUpdated}</p>
      <p>
        This policy explains which data is processed by the {SITE.name} service operated by{' '}
        {SITE.operator} (“we”). {SITE.operator} is the data controller under the Turkish Personal
        Data Protection Law No. 6698 (KVKK) and, where applicable, the EU General Data Protection
        Regulation (GDPR).
      </p>

      <h2>Content you share</h2>
      <p>
        Text and files you share are encrypted in your browser before they are sent to the server.
        The key to decrypt them exists only with you and the people you share them with; we cannot
        read the content. Encrypted content is deleted automatically when the chosen time runs out
        or when you delete it. File names and types are encrypted as well.
      </p>

      <h2>Technical data</h2>
      <ul>
        <li>
          <strong>IP address:</strong> kept in counters lasting at most a few minutes to prevent
          abuse and overload. It is not linked to content and not written to access logs.
        </li>
        <li>
          <strong>Service metrics:</strong> anonymous numbers such as the total number of shares
          that cannot be linked to a person.
        </li>
        <li>
          <strong>Browser storage:</strong> so that you can delete what you created, deletion keys
          are kept only in your own browser until the content expires. We use no cookies or tracking
          tools.
        </li>
      </ul>

      <h2>Abuse reports</h2>
      <p>
        Information sent through the <Link to="/bildir">report form</Link> (the reported link, the
        description and your optional contact details) is kept for 30 days for review.
      </p>

      <h2>Third parties</h2>
      <p>
        The service runs on hosting, storage and (if enabled) error tracking providers. These
        providers can only access encrypted content and the technical data above. Request addresses,
        bodies and IP addresses are removed from error reports before they are sent.
      </p>

      <h2>Your rights</h2>
      <p>
        For your rights under Article 11 of KVKK and the GDPR (access, rectification, erasure,
        objection, etc.) write to <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
        Please note that since there are no accounts and content is encrypted, in most cases we do
        not hold data that could identify you.
      </p>
    </Prose>
  );
}
