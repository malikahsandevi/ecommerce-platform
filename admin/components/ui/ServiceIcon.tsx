"use client";

import React from "react";
import {
  siAdyen,
  siAftership,
  siBraintree,
  siCloudflare,
  siCloudinary,
  siDhl,
  siFacebook,
  siFedex,
  siGithub,
  siGoogle,
  siGoogleanalytics,
  siGooglemaps,
  siMailgun,
  siMapbox,
  siMeta,
  siPaddle,
  siPaypal,
  siRazorpay,
  siResend,
  siSquare,
  siStripe,
  siUps,
  siUsps,
  siVonage,
  type SimpleIcon,
} from "simple-icons";
import {
  Banknote,
  Bike,
  CloudUpload,
  CreditCard,
  Database,
  KeyRound,
  Mail,
  Package,
  Phone,
  Plane,
  Puzzle,
  Send,
  Server,
  Ship,
  Smartphone,
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
  "meta-pixel": siMeta,
  "google-maps": siGooglemaps,
  mapbox: siMapbox,
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
