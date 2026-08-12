# Buscador de Oficinas v1.0.3

Versión independiente del buscador de oficinas. Conserva la interfaz de la versión publicada y combina las oficinas de **Servientrega**, **LaarCourier** y **Urbano** desde el Google Sheet oficial.

## Sincronización

El workflow `Sync offices from Google Sheets` se ejecuta diariamente a las 08:17 UTC y también puede iniciarse manualmente. Descarga las pestañas `SERVIENTREGA`, `LAARCOURIER` y `URBANO`, normaliza ciudad/provincia, elimina duplicados, valida la salida y actualiza `data/offices.json`. Al terminar, el sitio se vuelve a publicar automáticamente.

## Uso local

```bash
npm run sync
npm test
npx serve .
```

La aplicación es estática y se publica con GitHub Pages.
