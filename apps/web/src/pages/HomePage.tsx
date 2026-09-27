import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CodeInput } from '../components/CodeInput';
import { ShareForm } from '../components/ShareForm';
import { ShareResult } from '../components/ShareResult';
import type { CreatedClip } from '../lib/clips';

export function HomePage() {
  const navigate = useNavigate();
  const [created, setCreated] = useState<CreatedClip | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {created ? (
        <ShareResult clip={created} onDone={() => setCreated(null)} />
      ) : (
        <ShareForm onCreated={setCreated} />
      )}

      <section className="card flex flex-col gap-3" aria-labelledby="receive-title">
        <div>
          <h2 id="receive-title" className="text-lg font-semibold">
            Başka bir cihazdan mı paylaşıldı?
          </h2>
          <p className="muted">Kodu girin, içerik bu cihazda çözülsün.</p>
        </div>
        <CodeInput onSubmit={({ id, secret }) => navigate(`/c/${id}#s=${secret}`)} />
      </section>
    </div>
  );
}
