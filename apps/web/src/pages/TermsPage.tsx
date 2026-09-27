import { Link } from 'react-router';
import { Prose } from '../components/Prose';
import { SITE } from '../lib/site';
import { useTitle } from '../lib/use-title';

// Not: Bu metin bir şablondur; yayına almadan önce bir hukukçuya gözden geçirtin.
export function TermsPage() {
  useTitle('Kullanım koşulları');
  return (
    <Prose title="Kullanım koşulları">
      <p className="muted">Son güncelleme: {SITE.legalUpdated}</p>
      <p>
        {SITE.name} hizmetini kullanarak bu koşulları kabul etmiş olursunuz. Hizmet, {SITE.operator}{' '}
        tarafından ücretsiz olarak ve “olduğu gibi” sunulur.
      </p>

      <h2>Kabul edilebilir kullanım</h2>
      <p>Hizmeti aşağıdakiler için kullanamazsınız:</p>
      <ul>
        <li>Yürürlükteki mevzuata aykırı içerik paylaşmak,</li>
        <li>Zararlı yazılım, kimlik avı (phishing) ya da dolandırıcılık amaçlı içerik dağıtmak,</li>
        <li>Başkalarının telif, marka ya da kişilik haklarını ihlal etmek,</li>
        <li>Çocukların istismarına yönelik her türlü içerik,</li>
        <li>
          Hizmetin işleyişini bozmak, sınırlamaları aşmaya çalışmak ya da aşırı yük bindirmek.
        </li>
      </ul>

      <h2>İçerik ve sorumluluk</h2>
      <p>
        Paylaştığınız içerikten siz sorumlusunuz. İçerik uçtan uca şifrelendiği için tarafımızca
        görülemez; ancak bize bildirilen içerikleri, bildirimle birlikte sağlanan link üzerinden
        inceleyebilir ve koşullara aykırı bulduğumuz içeriği önceden haber vermeden silebiliriz.
        Yetkili makamlardan gelen yasal taleplere mevzuat çerçevesinde yanıt veririz.
      </p>

      <h2>Hizmetin sınırları</h2>
      <ul>
        <li>İçerikler geçicidir; en fazla 7 gün, canlı odalar 24 saat hareketsizlikte silinir.</li>
        <li>Paylaşım boyutu ve istek sayısı sınırlıdır.</li>
        <li>
          Hizmeti kalıcı bir yedekleme aracı olarak kullanmayın; içeriklerin kaybından sorumlu
          değiliz.
        </li>
        <li>Hizmeti dilediğimiz zaman değiştirebilir ya da sonlandırabiliriz.</li>
      </ul>

      <h2>Bildirim ve iletişim</h2>
      <p>
        Koşullara aykırı bir içerik görürseniz <Link to="/bildir">bildirim formunu</Link> kullanın.
        Diğer konular için: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
      </p>
    </Prose>
  );
}
