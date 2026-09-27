import { Link } from 'react-router';
import { Prose } from '../components/Prose';
import { useI18n } from '../i18n/use-i18n';
import { useTitle } from '../lib/use-title';

export function HowItWorksPage() {
  useTitle('titles.howItWorks');
  return useI18n().lang === 'en' ? <HowItWorksEn /> : <HowItWorksTr />;
}

function HowItWorksTr() {
  return (
    <Prose title="Nasıl çalışır?">
      <p>
        ClipBoard, metin ve dosyaları cihazlarınız arasında hesap açmadan taşımanızı sağlar. Her şey
        tarayıcınızda şifrelenir; sunucumuz yalnızca anlamsız baytları saklar ve içeriği okuyamaz.
      </p>

      <h2>Paylaşım</h2>
      <ul>
        <li>
          Metni yapıştırıp <strong>Şifrele ve paylaş</strong>a bastığınızda tarayıcınız rastgele bir
          anahtar üretir ve içeriği AES-256-GCM ile şifreler.
        </li>
        <li>
          <strong>Link</strong> anahtarı adresin <code>#</code> işaretinden sonraki kısmında taşır.
          Tarayıcılar bu kısmı sunucuya hiç göndermez.
        </li>
        <li>
          <strong>Kısa kod</strong> (ör. ABCD-EFGH) yazması kolaydır ama daha kısadır. Sunucu,
          koddan türetilen bir doğrulama anahtarı olmadan içeriği vermez ve 5 hatalı denemeden sonra
          kodla erişimi kilitler. Hassas veriler için link ya da QR kodu tercih edin.
        </li>
        <li>
          <strong>Parola</strong> eklerseniz içeriği açmak için hem link hem parola gerekir.
        </li>
        <li>
          Seçtiğiniz süre dolduğunda (en fazla 7 gün) ya da <strong>ilk açılışta sil</strong>{' '}
          seçiliyse ilk açılışta içerik sunucudan silinir.
        </li>
      </ul>

      <h2>Canlı oda</h2>
      <p>
        Bir oda açıp kodunu diğer cihazınızda girdiğinizde, birinde gönderdiğiniz her şey
        diğerlerinde anında görünür. Oda kodu şifreleme anahtarını da belirler; sunucu kodu ve
        içeriği göremez. Oda son 50 öğeyi tutar ve 24 saat hareketsiz kalınca silinir.
      </p>

      <h2>Sunucunun gördükleri</h2>
      <ul>
        <li>Şifreli içerik ve boyutu, oluşturulma ve silinme zamanı.</li>
        <li>Kısa kodun ilk 4 karakteri (kimlik) ve erişim anahtarlarının özetleri.</li>
        <li>
          Kötüye kullanımı sınırlamak için IP adresiniz kısa süreli bir sayaçta tutulur; içerikle
          birlikte saklanmaz ve günlüklere yazılmaz.
        </li>
      </ul>

      <p>
        Ayrıntılar için <Link to="/gizlilik">gizlilik politikası</Link>na bakın.
      </p>
    </Prose>
  );
}

function HowItWorksEn() {
  return (
    <Prose title="How does it work?">
      <p>
        ClipBoard lets you move text and files between your devices without an account. Everything
        is encrypted in your browser; our server only stores meaningless bytes and cannot read the
        content.
      </p>

      <h2>Sharing</h2>
      <ul>
        <li>
          When you paste text and press <strong>Encrypt and share</strong>, your browser creates a
          random key and encrypts the content with AES-256-GCM.
        </li>
        <li>
          The <strong>link</strong> carries the key after the <code>#</code> sign. Browsers never
          send that part to the server.
        </li>
        <li>
          The <strong>short code</strong> (e.g. ABCD-EFGH) is easy to type but shorter. The server
          only releases the content with a verification key derived from the code and locks code
          access after 5 wrong attempts. Prefer the link or QR code for sensitive data.
        </li>
        <li>
          If you add a <strong>password</strong>, both the link and the password are needed to open
          it.
        </li>
        <li>
          The content is deleted from the server when the chosen time runs out (at most 7 days), or
          on first view if <strong>delete after first view</strong> is selected.
        </li>
      </ul>

      <h2>Live room</h2>
      <p>
        Open a room and enter its code on your other device: everything you send on one appears
        instantly on the others. The room code also determines the encryption key; the server sees
        neither the code nor the content. A room keeps the last 50 items and is deleted after 24
        hours of inactivity.
      </p>

      <h2>What the server sees</h2>
      <ul>
        <li>The encrypted content and its size, creation and deletion time.</li>
        <li>The first 4 characters of a short code (its id) and hashes of access keys.</li>
        <li>
          To limit abuse, your IP address is kept in a short-lived counter; it is never stored with
          the content or written to logs.
        </li>
      </ul>

      <p>
        See the <Link to="/gizlilik">privacy policy</Link> for details.
      </p>
    </Prose>
  );
}
