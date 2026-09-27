import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatRoomCode } from '@clipboard/shared';
import { CodeInput, RoomCodeInput } from '../components/CodeInput';
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

      <section className="card flex flex-col gap-4" aria-labelledby="room-card-title">
        <div>
          <h2 id="room-card-title" className="text-lg font-semibold">
            Canlı oda
          </h2>
          <p className="muted">
            Cihazlarınızı bir oda koduyla eşleştirin; birinde gönderdiğiniz her şey diğerlerinde
            anında görünsün.
          </p>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Link to="/r" className="btn-primary self-start sm:self-auto">
            Yeni oda oluştur
          </Link>
          <div className="flex-1">
            <RoomCodeInput onSubmit={(code) => navigate(`/r#${formatRoomCode(code)}`)} />
          </div>
        </div>
      </section>
    </div>
  );
}
