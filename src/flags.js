// Flag SVGs (flag-icons, MIT). Only the countries present in data/locations.json are bundled.
import f_za from "../node_modules/flag-icons/flags/1x1/za.svg?url";
import f_ng from "../node_modules/flag-icons/flags/1x1/ng.svg?url";
import f_gb from "../node_modules/flag-icons/flags/1x1/gb.svg?url";
import f_jp from "../node_modules/flag-icons/flags/1x1/jp.svg?url";
import f_nl from "../node_modules/flag-icons/flags/1x1/nl.svg?url";
import f_us from "../node_modules/flag-icons/flags/1x1/us.svg?url";
import f_in from "../node_modules/flag-icons/flags/1x1/in.svg?url";
import f_is from "../node_modules/flag-icons/flags/1x1/is.svg?url";
import f_ca from "../node_modules/flag-icons/flags/1x1/ca.svg?url";
import f_de from "../node_modules/flag-icons/flags/1x1/de.svg?url";
import f_fi from "../node_modules/flag-icons/flags/1x1/fi.svg?url";
import f_il from "../node_modules/flag-icons/flags/1x1/il.svg?url";
import f_fr from "../node_modules/flag-icons/flags/1x1/fr.svg?url";
import f_pl from "../node_modules/flag-icons/flags/1x1/pl.svg?url";
import f_no from "../node_modules/flag-icons/flags/1x1/no.svg?url";
import f_au from "../node_modules/flag-icons/flags/1x1/au.svg?url";
import f_sg from "../node_modules/flag-icons/flags/1x1/sg.svg?url";

const urls = {
  za: f_za,
  ng: f_ng,
  gb: f_gb,
  jp: f_jp,
  nl: f_nl,
  us: f_us,
  in: f_in,
  is: f_is,
  ca: f_ca,
  de: f_de,
  fi: f_fi,
  il: f_il,
  fr: f_fr,
  pl: f_pl,
  no: f_no,
  au: f_au,
  sg: f_sg,
};
export const flagUrl = (cc) => urls[cc.toLowerCase()] ?? null;
