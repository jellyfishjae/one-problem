import { defineConfig } from '@vite-pwa/assets-generator/config'
import { minimalPreset } from '@vite-pwa/assets-generator/presets'

export default defineConfig({
  images: ['public/icon.svg'],
  preset: {
    ...minimalPreset,
    transparent: { ...minimalPreset.transparent, padding: 0 },
    maskable: { ...minimalPreset.maskable, padding: 0 },
    apple: { ...minimalPreset.apple, padding: 0 },
  },
})
