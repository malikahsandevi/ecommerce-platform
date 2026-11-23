"use client";

import React from "react";
import {
  siAdyen,
  siAftership,
  siAuth0,
  siBackblaze,
  siBraintree,
  siClerk,
  siCloudflare,
  siCloudinary,
  siDhl,
  siDigitalocean,
  siFacebook,
  siFedex,
  siFirebase,
  siGithub,
  siGoogle,
  siGoogleanalytics,
  siGooglecloudstorage,
  siGooglemaps,
  siGoogletagmanager,
  siMailgun,
  siMapbox,
  siMeta,
  siMinio,
  siMixpanel,
  siPaddle,
  siPaypal,
  siRazorpay,
  siResend,
  siSquare,
  siStripe,
  siSupabase,
  siUps,
  siUsps,
  siVonage,
  siWasabi,
  type SimpleIcon,
} from "simple-icons";
import {
  Banknote,
  Bike,
  Bird,
  Cloud,
  CloudUpload,
  CreditCard,
  Database,
  KeyRound,
  Mail,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  MousePointerClick,
  Package,
  Phone,
  PhoneCall,
  PhoneOutgoing,
  Plane,
  Puzzle,
  Rabbit,
  Radio,
  Send,
  Server,
  Ship,
  Smartphone,
  Stamp,
  Truck,
  Wallet,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Per-sub-service icons for the Settings integration entries (Ahsan's
 * order: "icon sahi lagao, jo lagte hain" — every service gets its OWN
 * recognisable mark, not one generic globe for everything).
 *
 * Real brand marks come from the locally bundled `simple-icons`
 * package (no external hotlinks/CDN). Sub-services with no brand mark
 * in the set get a fitting, distinct Lucide icon instead. Brand marks
 * render single-colour via currentColor, so they take the palette
 * primary like the rest of the panel.
 */
const BRAND_ICONS: Record<string, SimpleIcon> = {
  cloudinary: siCloudinary,
  "cloudflare-r2": siCloudflare,
  stripe: siStripe,
  paypal: siPaypal,
  razorpay: siRazorpay,
  square: siSquare,
  adyen: siAdyen,
  braintree: siBraintree,
  paddle: siPaddle,
  resend: siResend,
  mailgun: siMailgun,
  vonage: siVonage,
  google: siGoogle,
  facebook: siFacebook,
  github: siGithub,
  fedex: siFedex,
  ups: siUps,
  dhl: siDhl,
  usps: siUsps,
  aftership: siAftership,
  "google-analytics": siGoogleanalytics,
  "google-tag-manager": siGoogletagmanager,
  "meta-pixel": siMeta,
  "google-maps": siGooglemaps,
  mapbox: siMapbox,
  "google-cloud-storage": siGooglecloudstorage,
  "digitalocean-spaces": siDigitalocean,
  "backblaze-b2": siBackblaze,
  wasabi: siWasabi,
  "supabase-storage": siSupabase,
  "firebase-storage": siFirebase,
  "firebase-auth": siFirebase,
  minio: siMinio,
  auth0: siAuth0,
  clerk: siClerk,
  mixpanel: siMixpanel,
};

const LUCIDE_ICONS: Record<string, LucideIcon> = {
  "aws-s3": Database,
  "checkout-com": CreditCard,
  mollie: Wallet,
  jazzcash: Banknote,
  easypaisa: Smartphone,
  payfast: Zap,
  "hosting-mail": Server,
  smtp: Mail,
  sendgrid: Send,
  twilio: Phone,
  "store-session-jwt": KeyRound,
  custom: Wrench,
  easypost: Package,
  shippo: Ship,
  aramex: Plane,
  sendcloud: CloudUpload,
  leopards: Truck,
  postex: Bike,
  "azure-blob-storage": Cloud,
  "bunny-storage": Rabbit,
  messagebird: Bird,
  plivo: PhoneCall,
  sinch: MessagesSquare,
  infobip: MessageSquare,
  bandwidth: Radio,
  telnyx: PhoneOutgoing,
  "amazon-sns": Megaphone,
  clicksend: MousePointerClick,
  postmark: Stamp,
};

export const ServiceIcon: React.FC<{
  subService?: string | null;
  className?: string;
}> = ({ subService, className }) => {
  const brand = subService ? BRAND_ICONS[subService] : undefined;
  if (brand) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
        aria-hidden="true"
        data-service-icon={subService ?? undefined}
        data-icon-kind="brand"
      >
        <path d={brand.path} />
      </svg>
    );
  }
  const Fallback =
    (subService && LUCIDE_ICONS[subService]) || Puzzle;
  return (
    <Fallback
      className={className}
      aria-hidden="true"
      data-service-icon={subService ?? undefined}
      data-icon-kind="lucide"
    />
  );
};

export default ServiceIcon;
