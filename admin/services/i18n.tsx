"use client";

// Admin language (Settings → General → Language) — a real i18n layer,
// not just a stored value. The choice lives in the settings document
// (general.language, stored as the language's English label), is
// cached on the device (localStorage "admin-language" + the
// "language" cookie, exactly like the theme) so the root layout can
// render <html lang dir> correctly on first paint, and is applied by
// AdminShell once signed in via fetchAndApplyLanguage().
//
// SCOPE: the dictionary covers the admin SHELL and common strings —
// sidebar + mobile navigation, top bar, settings section names, the
// dashboard block labels and the shared actions (Save, Add, Edit,
// Delete, Search, Test…). Deep page content (table columns, resource
// forms, detail panels) is NOT translated and stays English; t()
// falls back to the English key for anything untranslated.
//
// DIRECTION: text translates IN PLACE, exactly where it sits — the
// layout and direction NEVER change (always LTR, same positions),
// for every language including Urdu and Arabic (Ahsan's correction:
// flipping the layout would make the panel hard to manage).
import React, { createContext, useContext, useEffect, useState } from "react";
import { apiClient } from "./api";

export interface LanguageDef {
  label: string;
  code: string;
}

export const LANGUAGES: LanguageDef[] = [
  { label: "English", code: "en" },
  { label: "Urdu", code: "ur" },
  { label: "Arabic", code: "ar" },
  { label: "Hindi", code: "hi" },
  { label: "Bengali", code: "bn" },
  { label: "Spanish", code: "es" },
  { label: "French", code: "fr" },
  { label: "German", code: "de" },
  { label: "Turkish", code: "tr" },
  { label: "Chinese (Simplified)", code: "zh" },
];

export const LANGUAGE_OPTIONS = LANGUAGES.map((language) => language.label);

export const languageByLabel = (label?: string | null): LanguageDef =>
  LANGUAGES.find((language) => language.label === label) ?? LANGUAGES[0];

const STORAGE_KEY = "admin-language";
export const LANGUAGE_EVENT = "admin:language";

/** The device-cached language label (what the pre-paint script and
 *  the provider start from, before the settings fetch resolves). */
export function readDeviceLanguage(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || "English";
  } catch {
    return "English";
  }
}

/** Applies a language everywhere it must land: the <html lang>
 *  attribute, the device cache + cookie (so the next load renders it
 *  server-side), and every mounted useLanguage() consumer via the
 *  event. The layout direction is NEVER touched — text changes in
 *  place, positions stay identical. */
export function applyLanguage(label: string) {
  const def = languageByLabel(label);
  try {
    localStorage.setItem(STORAGE_KEY, def.label);
  } catch { /* private mode — the cookie below still carries it */ }
  document.cookie = `language=${encodeURIComponent(def.label)}; path=/; max-age=31536000; SameSite=Lax`;
  document.documentElement.setAttribute("lang", def.code);
  window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: def.label }));
}

/** Loads the saved language from the settings document and applies
 *  it (called once signed in, like Appearance and Currency). */
export async function fetchAndApplyLanguage(): Promise<void> {
  try {
    const { data } = await apiClient.get<{ general?: { language?: string } }>("/settings");
    const saved = data?.general?.language;
    if (saved && saved !== readDeviceLanguage()) applyLanguage(saved);
  } catch { /* keep the device language */ }
}

// ── Dictionary ───────────────────────────────────────────────────────
// Keys are the English source strings; t() returns the translation
// for the active language or the key itself.
type Dict = Record<string, Partial<Record<string, string>>>;

const T: Dict = {
  "Dashboard": { ur: "ڈیش بورڈ", ar: "لوحة التحكم", hi: "डैशबोर्ड", bn: "ড্যাশবোর্ড", es: "Panel", fr: "Tableau de bord", de: "Dashboard", tr: "Kontrol Paneli", zh: "仪表盘" },
  "Products": { ur: "مصنوعات", ar: "المنتجات", hi: "उत्पाद", bn: "পণ্য", es: "Productos", fr: "Produits", de: "Produkte", tr: "Ürünler", zh: "产品" },
  "Orders": { ur: "آرڈرز", ar: "الطلبات", hi: "ऑर्डर", bn: "অর্ডার", es: "Pedidos", fr: "Commandes", de: "Bestellungen", tr: "Siparişler", zh: "订单" },
  "Customers": { ur: "گاہک", ar: "العملاء", hi: "ग्राहक", bn: "গ্রাহক", es: "Clientes", fr: "Clients", de: "Kunden", tr: "Müşteriler", zh: "客户" },
  "Category": { ur: "زمرہ", ar: "الفئة", hi: "श्रेणी", bn: "বিভাগ", es: "Categoría", fr: "Catégorie", de: "Kategorie", tr: "Kategori", zh: "类别" },
  "Brands": { ur: "برانڈز", ar: "العلامات التجارية", hi: "ब्रांड", bn: "ব্র্যান্ড", es: "Marcas", fr: "Marques", de: "Marken", tr: "Markalar", zh: "品牌" },
  "Coupons": { ur: "کوپن", ar: "القسائم", hi: "कूपन", bn: "কুপন", es: "Cupones", fr: "Coupons", de: "Gutscheine", tr: "Kuponlar", zh: "优惠券" },
  "Media": { ur: "میڈیا", ar: "الوسائط", hi: "मीडिया", bn: "মিডিয়া", es: "Medios", fr: "Médias", de: "Medien", tr: "Medya", zh: "媒体" },
  "Reviews": { ur: "جائزے", ar: "التقييمات", hi: "समीक्षाएं", bn: "রিভিউ", es: "Reseñas", fr: "Avis", de: "Bewertungen", tr: "Yorumlar", zh: "评论" },
  "Settings": { ur: "ترتیبات", ar: "الإعدادات", hi: "सेटिंग्स", bn: "সেটিংস", es: "Configuración", fr: "Paramètres", de: "Einstellungen", tr: "Ayarlar", zh: "设置" },
  "Main Menu": { ur: "مرکزی مینو", ar: "القائمة الرئيسية", hi: "मुख्य मेनू", bn: "প্রধান মেনু", es: "Menú principal", fr: "Menu principal", de: "Hauptmenü", tr: "Ana Menü", zh: "主菜单" },
  "General": { ur: "عمومی", ar: "عام", hi: "सामान्य", bn: "সাধারণ", es: "General", fr: "Général", de: "Allgemein", tr: "Genel", zh: "通用" },
  "Collapse": { ur: "سکیڑیں", ar: "طي", hi: "सिकोड़ें", bn: "সংকুচিত করুন", es: "Contraer", fr: "Réduire", de: "Einklappen", tr: "Daralt", zh: "折叠" },
  "Search...": { ur: "تلاش کریں…", ar: "بحث…", hi: "खोजें…", bn: "খুঁজুন…", es: "Buscar…", fr: "Rechercher…", de: "Suchen…", tr: "Ara…", zh: "搜索…" },
  "Messages": { ur: "پیغامات", ar: "الرسائل", hi: "संदेश", bn: "বার্তা", es: "Mensajes", fr: "Messages", de: "Nachrichten", tr: "Mesajlar", zh: "消息" },
  "Notifications": { ur: "اطلاعات", ar: "الإشعارات", hi: "सूचनाएं", bn: "বিজ্ঞপ্তি", es: "Notificaciones", fr: "Notifications", de: "Benachrichtigungen", tr: "Bildirimler", zh: "通知" },
  "Save Changes": { ur: "تبدیلیاں محفوظ کریں", ar: "حفظ التغييرات", hi: "परिवर्तन सहेजें", bn: "পরিবর্তন সংরক্ষণ করুন", es: "Guardar cambios", fr: "Enregistrer les modifications", de: "Änderungen speichern", tr: "Değişiklikleri Kaydet", zh: "保存更改" },
  "Save": { ur: "محفوظ کریں", ar: "حفظ", hi: "सहेजें", bn: "সংরক্ষণ", es: "Guardar", fr: "Enregistrer", de: "Speichern", tr: "Kaydet", zh: "保存" },
  "Add": { ur: "شامل کریں", ar: "إضافة", hi: "जोड़ें", bn: "যোগ করুন", es: "Añadir", fr: "Ajouter", de: "Hinzufügen", tr: "Ekle", zh: "添加" },
  "Edit": { ur: "ترمیم", ar: "تعديل", hi: "संपादित करें", bn: "সম্পাদনা", es: "Editar", fr: "Modifier", de: "Bearbeiten", tr: "Düzenle", zh: "编辑" },
  "Delete": { ur: "حذف کریں", ar: "حذف", hi: "हटाएं", bn: "মুছুন", es: "Eliminar", fr: "Supprimer", de: "Löschen", tr: "Sil", zh: "删除" },
  "Cancel": { ur: "منسوخ", ar: "إلغاء", hi: "रद्द करें", bn: "বাতিল", es: "Cancelar", fr: "Annuler", de: "Abbrechen", tr: "İptal", zh: "取消" },
  "Search": { ur: "تلاش", ar: "بحث", hi: "खोज", bn: "খুঁজুন", es: "Buscar", fr: "Rechercher", de: "Suchen", tr: "Ara", zh: "搜索" },
  "Test": { ur: "جانچیں", ar: "اختبار", hi: "परीक्षण", bn: "পরীক্ষা", es: "Probar", fr: "Tester", de: "Testen", tr: "Test Et", zh: "测试" },
  "Active": { ur: "فعال", ar: "نشط", hi: "सक्रिय", bn: "সক্রিয়", es: "Activo", fr: "Actif", de: "Aktiv", tr: "Aktif", zh: "启用" },
  "Configured": { ur: "ترتیب شدہ", ar: "تمت التهيئة", hi: "कॉन्फ़िगर किया गया", bn: "কনফিগার করা", es: "Configurado", fr: "Configuré", de: "Konfiguriert", tr: "Yapılandırıldı", zh: "已配置" },
  "Not configured": { ur: "ترتیب نہیں", ar: "غير مهيأ", hi: "कॉन्फ़िगर नहीं", bn: "কনফিগার করা হয়নি", es: "No configurado", fr: "Non configuré", de: "Nicht konfiguriert", tr: "Yapılandırılmadı", zh: "未配置" },
  "Add New Service": { ur: "نئی سروس شامل کریں", ar: "إضافة خدمة جديدة", hi: "नई सेवा जोड़ें", bn: "নতুন পরিষেবা যোগ করুন", es: "Añadir nuevo servicio", fr: "Ajouter un service", de: "Neuen Dienst hinzufügen", tr: "Yeni Hizmet Ekle", zh: "添加新服务" },
  "Store Information": { ur: "اسٹور کی معلومات", ar: "معلومات المتجر", hi: "स्टोर की जानकारी", bn: "দোকানের তথ্য", es: "Información de la tienda", fr: "Informations du magasin", de: "Shop-Informationen", tr: "Mağaza Bilgileri", zh: "商店信息" },
  "Payment Methods": { ur: "ادائیگی کے طریقے", ar: "طرق الدفع", hi: "भुगतान विधियाँ", bn: "পেমেন্ট পদ্ধতি", es: "Métodos de pago", fr: "Moyens de paiement", de: "Zahlungsmethoden", tr: "Ödeme Yöntemleri", zh: "支付方式" },
  "Shipping": { ur: "ترسیل", ar: "الشحن", hi: "शिपिंग", bn: "শিপিং", es: "Envíos", fr: "Livraison", de: "Versand", tr: "Kargo", zh: "配送" },
  "Users & Roles": { ur: "صارفین و کردار", ar: "المستخدمون والأدوار", hi: "उपयोगकर्ता और भूमिकाएँ", bn: "ব্যবহারকারী ও ভূমিকা", es: "Usuarios y roles", fr: "Utilisateurs et rôles", de: "Benutzer & Rollen", tr: "Kullanıcılar ve Roller", zh: "用户与角色" },
  "Security": { ur: "سیکیورٹی", ar: "الأمان", hi: "सुरक्षा", bn: "নিরাপত্তা", es: "Seguridad", fr: "Sécurité", de: "Sicherheit", tr: "Güvenlik", zh: "安全" },
  "API / Integrations": { ur: "API / انضمام", ar: "API / التكاملات", hi: "API / एकीकरण", bn: "API / ইন্টিগ্রেশন", es: "API / Integraciones", fr: "API / Intégrations", de: "API / Integrationen", tr: "API / Entegrasyonlar", zh: "API / 集成" },
  "Appearance": { ur: "ظاہری شکل", ar: "المظهر", hi: "रूप", bn: "চেহারা", es: "Apariencia", fr: "Apparence", de: "Erscheinungsbild", tr: "Görünüm", zh: "外观" },
  "Manage your store settings and preferences": { ur: "اپنے اسٹور کی ترتیبات و ترجیحات کا انتظام کریں", ar: "إدارة إعدادات وتفضيلات متجرك", hi: "अपने स्टोर की सेटिंग्स और प्राथमिकताएँ प्रबंधित करें", bn: "আপনার দোকানের সেটিংস ও পছন্দ পরিচালনা করুন", es: "Administra la configuración y preferencias de tu tienda", fr: "Gérez les paramètres et préférences de votre magasin", de: "Verwalten Sie die Einstellungen Ihres Shops", tr: "Mağaza ayarlarınızı ve tercihlerinizi yönetin", zh: "管理商店设置和偏好" },
  "General Settings": { ur: "عمومی ترتیبات", ar: "الإعدادات العامة", hi: "सामान्य सेटिंग्स", bn: "সাধারণ সেটিংস", es: "Configuración general", fr: "Paramètres généraux", de: "Allgemeine Einstellungen", tr: "Genel Ayarlar", zh: "通用设置" },
  "Total Revenue": { ur: "کل آمدنی", ar: "إجمالي الإيرادات", hi: "कुल राजस्व", bn: "মোট রাজস্ব", es: "Ingresos totales", fr: "Revenus totaux", de: "Gesamtumsatz", tr: "Toplam Gelir", zh: "总收入" },
  "Total Orders": { ur: "کل آرڈرز", ar: "إجمالي الطلبات", hi: "कुल ऑर्डर", bn: "মোট অর্ডার", es: "Pedidos totales", fr: "Commandes totales", de: "Bestellungen gesamt", tr: "Toplam Sipariş", zh: "订单总数" },
  "Total Customers": { ur: "کل گاہک", ar: "إجمالي العملاء", hi: "कुल ग्राहक", bn: "মোট গ্রাহক", es: "Clientes totales", fr: "Clients totaux", de: "Kunden gesamt", tr: "Toplam Müşteri", zh: "客户总数" },
  "Revenue Analytics": { ur: "آمدنی کا تجزیہ", ar: "تحليلات الإيرادات", hi: "राजस्व विश्लेषण", bn: "রাজস্ব বিশ্লেষণ", es: "Análisis de ingresos", fr: "Analyse des revenus", de: "Umsatzanalyse", tr: "Gelir Analizi", zh: "收入分析" },
  "Monthly Target": { ur: "ماہانہ ہدف", ar: "الهدف الشهري", hi: "मासिक लक्ष्य", bn: "মাসিক লক্ষ্য", es: "Objetivo mensual", fr: "Objectif mensuel", de: "Monatsziel", tr: "Aylık Hedef", zh: "月度目标" },
  "Top Categories": { ur: "سرفہرست زمرے", ar: "أهم الفئات", hi: "शीर्ष श्रेणियाँ", bn: "শীর্ষ বিভাগ", es: "Categorías principales", fr: "Meilleures catégories", de: "Top-Kategorien", tr: "En İyi Kategoriler", zh: "热门类别" },
  "New Customers": { ur: "نئے گاہک", ar: "عملاء جدد", hi: "नए ग्राहक", bn: "নতুন গ্রাহক", es: "Nuevos clientes", fr: "Nouveaux clients", de: "Neue Kunden", tr: "Yeni Müşteriler", zh: "新客户" },
  "Inventory Overview": { ur: "انوینٹری کا جائزہ", ar: "نظرة عامة على المخزون", hi: "इन्वेंटरी अवलोकन", bn: "ইনভেন্টরি ওভারভিউ", es: "Resumen de inventario", fr: "Aperçu de l'inventaire", de: "Lagerübersicht", tr: "Stok Özeti", zh: "库存概览" },
  "Orders by Status": { ur: "حیثیت کے مطابق آرڈرز", ar: "الطلبات حسب الحالة", hi: "स्थिति के अनुसार ऑर्डर", bn: "স্ট্যাটাস অনুযায়ী অর্ডার", es: "Pedidos por estado", fr: "Commandes par statut", de: "Bestellungen nach Status", tr: "Duruma Göre Siparişler", zh: "按状态统计订单" },
  "Recent Orders": { ur: "حالیہ آرڈرز", ar: "أحدث الطلبات", hi: "हाल के ऑर्डर", bn: "সাম্প্রতিক অর্ডার", es: "Pedidos recientes", fr: "Commandes récentes", de: "Neueste Bestellungen", tr: "Son Siparişler", zh: "最近订单" },
  "Recent Activity": { ur: "حالیہ سرگرمی", ar: "النشاط الأخير", hi: "हाल की गतिविधि", bn: "সাম্প্রতিক কার্যকলাপ", es: "Actividad reciente", fr: "Activité récente", de: "Letzte Aktivität", tr: "Son Aktivite", zh: "最近动态" },
};

export function translate(label: string, key: string): string {
  const def = languageByLabel(label);
  if (def.code === "en") return key;
  return T[key]?.[def.code] ?? key;
}

// ── React wiring ─────────────────────────────────────────────────────
interface LanguageContextValue {
  language: string;
  def: LanguageDef;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "English",
  def: LANGUAGES[0],
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<string>("English");

  useEffect(() => {
    setLanguage(readDeviceLanguage());
    const onChange = (event: Event) => {
      setLanguage((event as CustomEvent<string>).detail || readDeviceLanguage());
    };
    window.addEventListener(LANGUAGE_EVENT, onChange);
    return () => window.removeEventListener(LANGUAGE_EVENT, onChange);
  }, []);

  const def = languageByLabel(language);
  return (
    <LanguageContext.Provider
      value={{ language, def, t: (key: string) => translate(language, key) }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
