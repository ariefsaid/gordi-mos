import { en } from '@blocknote/core/locales'
import type { Locale } from '@/i18n/messages'

type Dictionary = typeof en
type SlashKey = 'heading' | 'heading_2' | 'heading_3' | 'quote' | 'numbered_list' | 'bullet_list' | 'check_list' | 'paragraph'

const HEADINGS = 'Judul'
const BASIC = 'Blok dasar'

// The editor library ships English only. These are the strings the write-up's menus show.
const slash = (key: SlashKey, title: string, subtext: string, group: string, alias: string) => ({
  ...en.slash_menu[key],
  title,
  subtext,
  group,
  aliases: [...en.slash_menu[key].aliases, alias],
})

const id: Dictionary = {
  ...en,
  slash_menu: {
    ...en.slash_menu,
    heading: slash('heading', 'Judul 1', 'Judul tingkat atas', HEADINGS, 'judul'),
    heading_2: slash('heading_2', 'Judul 2', 'Judul bagian utama', HEADINGS, 'judul'),
    heading_3: slash('heading_3', 'Judul 3', 'Judul subbagian', HEADINGS, 'judul'),
    quote: slash('quote', 'Kutipan', 'Kutipan atau petikan', BASIC, 'kutipan'),
    numbered_list: slash('numbered_list', 'Daftar bernomor', 'Daftar berurutan', BASIC, 'daftar'),
    bullet_list: slash('bullet_list', 'Daftar berpoin', 'Daftar tanpa urutan', BASIC, 'daftar'),
    check_list: slash('check_list', 'Daftar centang', 'Daftar dengan kotak centang', BASIC, 'daftar'),
    paragraph: slash('paragraph', 'Paragraf', 'Isi dokumen', BASIC, 'paragraf'),
  },
  placeholders: { ...en.placeholders, default: "Ketik '/' untuk perintah" },
  side_menu: { add_block_label: 'Tambah blok', drag_handle_label: 'Buka menu blok' },
  drag_handle: { ...en.drag_handle, delete_menuitem: 'Hapus', colors_menuitem: 'Warna' },
  suggestion_menu: { no_items_title: 'Tidak ada hasil' },
  color_picker: {
    text_title: 'Teks',
    background_title: 'Latar',
    colors: {
      default: 'Otomatis',
      gray: 'Abu-abu',
      brown: 'Cokelat',
      red: 'Merah',
      orange: 'Oranye',
      yellow: 'Kuning',
      green: 'Hijau',
      blue: 'Biru',
      purple: 'Ungu',
      pink: 'Merah muda',
    },
  },
  formatting_toolbar: {
    ...en.formatting_toolbar,
    bold: { ...en.formatting_toolbar.bold, tooltip: 'Tebal' },
    italic: { ...en.formatting_toolbar.italic, tooltip: 'Miring' },
    underline: { ...en.formatting_toolbar.underline, tooltip: 'Garis bawah' },
    strike: { ...en.formatting_toolbar.strike, tooltip: 'Coret' },
    code: { ...en.formatting_toolbar.code, tooltip: 'Kode' },
    colors: { tooltip: 'Warna' },
    link: { ...en.formatting_toolbar.link, tooltip: 'Buat tautan' },
    nest: { ...en.formatting_toolbar.nest, tooltip: 'Jorokkan blok' },
    unnest: { ...en.formatting_toolbar.unnest, tooltip: 'Tarik blok kembali' },
    align_left: { tooltip: 'Rata kiri' },
    align_center: { tooltip: 'Rata tengah' },
    align_right: { tooltip: 'Rata kanan' },
    align_justify: { tooltip: 'Rata kiri-kanan' },
  },
  link_toolbar: {
    delete: { tooltip: 'Hapus tautan' },
    edit: { text: 'Ubah tautan', tooltip: 'Ubah' },
    open: { tooltip: 'Buka di tab baru' },
    form: { title_placeholder: 'Ubah judul', url_placeholder: 'Ubah URL' },
  },
}

export function writeUpDictionary(locale: Locale): Dictionary {
  return locale === 'id' ? id : en
}
