import { Link } from 'react-router';
import { Prose } from '../components/Prose';
import { useTitle } from '../lib/use-title';

export function HowItWorksPage() {
  useTitle('Nasıl çalışır');
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
