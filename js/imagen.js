// Preparación de fotos: se achican en el propio dispositivo antes de guardarlas.
//  - "grande": JPEG de hasta 1600 px (va al Drive de la iglesia).
//  - "miniatura": JPEG chico (data URL) que se guarda en la base para verlo en pantalla e informes.

async function cargar(archivo) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(archivo, { imageOrientation: 'from-image' }); } catch { /* se prueba con <img> */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen. Probá con otra foto (JPG o PNG).')); };
    img.src = url;
  });
}

function dibujar(img, maxLado) {
  const w0 = img.width; const h0 = img.height;
  const k = Math.min(1, maxLado / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * k));
  c.height = Math.max(1, Math.round(h0 * k));
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export async function procesarFoto(archivo) {
  if (!archivo || !/^image\//.test(archivo.type)) throw new Error('El archivo elegido no es una imagen.');
  const img = await cargar(archivo);
  const grande = await new Promise((res, rej) => dibujar(img, 1600).toBlob((b) => (b ? res(b) : rej(new Error('No se pudo preparar la foto.'))), 'image/jpeg', 0.82));
  const miniatura = dibujar(img, 320).toDataURL('image/jpeg', 0.7);
  if (img.close) img.close();
  return { grande, miniatura };
}
