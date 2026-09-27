import { Link } from 'react-router';
import { Prose } from '../components/Prose';
import { SITE } from '../lib/site';
import { useI18n } from '../i18n/use-i18n';
import { useTitle } from '../lib/use-title';

// Not: Bu metin bir şablondur; yayına almadan önce bir hukukçuya gözden geçirtin.
export function TermsPage() {
  useTitle('titles.terms');
  return useI18n().lang === 'en' ? <TermsEn /> : <TermsTr />;
}

function TermsTr() {
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

function TermsEn() {
  return (
    <Prose title="Terms of use">
      <p className="muted">Last updated: {SITE.legalUpdated}</p>
      <p>
        By using {SITE.name} you accept these terms. The service is provided free of charge and “as
        is” by {SITE.operator}.
      </p>

      <h2>Acceptable use</h2>
      <p>You may not use the service to:</p>
      <ul>
        <li>share content that violates applicable law,</li>
        <li>distribute malware, phishing or fraudulent content,</li>
        <li>infringe the copyright, trademark or personal rights of others,</li>
        <li>share any content involving the abuse of children,</li>
        <li>disrupt the service, try to circumvent its limits or overload it.</li>
      </ul>

      <h2>Content and responsibility</h2>
      <p>
        You are responsible for the content you share. Since content is end-to-end encrypted we
        cannot see it; however, we may review content reported to us through the link provided with
        the report and remove content we find in breach of these terms without prior notice. We
        respond to legal requests from competent authorities as required by law.
      </p>

      <h2>Limits of the service</h2>
      <ul>
        <li>Content is temporary: at most 7 days; live rooms are deleted after 24 hours idle.</li>
        <li>Share sizes and the number of requests are limited.</li>
        <li>Do not use the service as permanent backup; we are not liable for lost content.</li>
        <li>We may change or discontinue the service at any time.</li>
      </ul>

      <h2>Reports and contact</h2>
      <p>
        If you see content that breaks these terms, use the <Link to="/bildir">report form</Link>.
        For anything else: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
      </p>
    </Prose>
  );
}
