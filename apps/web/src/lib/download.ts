/** Baytları tarayıcıda dosya olarak indirir. */
export function saveBytes(data: BlobPart, name: string, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  // Bazı tarayıcılar belgeye bağlı olmayan bağlantılarda dosya adını yok sayar.
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
