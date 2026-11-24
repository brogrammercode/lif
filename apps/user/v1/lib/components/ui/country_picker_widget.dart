import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:user/components/ui/solid_ui.dart';

/// A country-aware phone field that stores canonical E.164 text in [controller].
/// The visible input contains national digits; the selected calling code is
/// composed into the controller value (for example, +919876543210).
class CountryPickerWidget extends StatefulWidget {
  final TextEditingController controller;
  final String label;
  final String? hint;
  final String defaultCountryCode;
  final bool enabled;
  final TextInputAction? textInputAction;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onChanged;
  final bool showLabel;

  const CountryPickerWidget({
    super.key,
    required this.controller,
    required this.label,
    this.hint,
    this.defaultCountryCode = 'IN',
    this.enabled = true,
    this.textInputAction,
    this.validator,
    this.onChanged,
    this.showLabel = true,
  });

  @override
  State<CountryPickerWidget> createState() => _CountryPickerWidgetState();
}

class _CountryPickerWidgetState extends State<CountryPickerWidget> {
  late CountryOption _country;
  late final TextEditingController _nationalNumber;
  bool _writingExternal = false;

  @override
  void initState() {
    super.initState();
    final parsed = _parseInternational(widget.controller.text);
    _country =
        parsed?.country ??
        CountryOption.byIso(widget.defaultCountryCode) ??
        CountryOption.byIso('IN')!;
    _nationalNumber = TextEditingController(
      text:
          parsed?.nationalNumber ??
          widget.controller.text.replaceAll(RegExp(r'\D'), ''),
    );
    widget.controller.addListener(_externalChanged);
    _writeCanonical(notify: false);
  }

  @override
  void didUpdateWidget(covariant CountryPickerWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_externalChanged);
      widget.controller.addListener(_externalChanged);
      _syncFromExternal();
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_externalChanged);
    _nationalNumber.dispose();
    super.dispose();
  }

  void _externalChanged() {
    if (!_writingExternal) _syncFromExternal();
  }

  void _syncFromExternal() {
    final parsed = _parseInternational(widget.controller.text);
    if (parsed == null) {
      final digits = widget.controller.text.replaceAll(RegExp(r'\D'), '');
      if (_nationalNumber.text != digits) _nationalNumber.text = digits;
      return;
    }
    if (!mounted) {
      _country = parsed.country;
      _nationalNumber.text = parsed.nationalNumber;
      return;
    }
    setState(() {
      _country = parsed.country;
      _nationalNumber.text = parsed.nationalNumber;
    });
  }

  _ParsedPhone? _parseInternational(String raw) {
    final trimmed = raw.trim();
    if (!trimmed.startsWith('+')) return null;
    final digits = trimmed.replaceAll(RegExp(r'\D'), '');
    final match =
        CountryOption.all
            .where((country) => digits.startsWith(country.dialCode))
            .toList()
          ..sort((a, b) => b.dialCode.length.compareTo(a.dialCode.length));
    if (match.isEmpty) return null;
    final country = match.first;
    return _ParsedPhone(country, digits.substring(country.dialCode.length));
  }

  String get _canonical => _nationalNumber.text.isEmpty
      ? ''
      : '+${_country.dialCode}${_nationalNumber.text}';

  void _writeCanonical({bool notify = true}) {
    final value = _canonical;
    _writingExternal = true;
    widget.controller.value = TextEditingValue(
      text: value,
      selection: TextSelection.collapsed(offset: value.length),
    );
    _writingExternal = false;
    if (notify) widget.onChanged?.call(value);
  }

  Future<void> _chooseCountry() async {
    if (!widget.enabled) return;
    FocusManager.instance.primaryFocus?.unfocus();
    final selected = await showModalBottomSheet<CountryOption>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _CountryPickerSheet(selected: _country),
    );
    if (selected == null || !mounted) return;
    setState(() => _country = selected);
    _writeCanonical();
  }

  @override
  Widget build(BuildContext context) => SolidTextFormField(
    label: widget.label,
    showLabel: widget.showLabel,
    hint: widget.hint ?? 'Phone number',
    controller: _nationalNumber,
    enabled: widget.enabled,
    keyboardType: TextInputType.phone,
    textCapitalization: TextCapitalization.none,
    textInputAction: widget.textInputAction,
    inputFormatters: [
      FilteringTextInputFormatter.digitsOnly,
      LengthLimitingTextInputFormatter(15 - _country.dialCode.length),
    ],
    onChanged: (_) => _writeCanonical(),
    validator: (_) => widget.validator?.call(_canonical),
    prefixIconConstraints: const BoxConstraints(
      minWidth: 94,
      maxWidth: 110,
      minHeight: 48,
    ),
    prefixIcon: Semantics(
      button: true,
      label: 'Country code, ${_country.name}, +${_country.dialCode}',
      child: InkWell(
        onTap: _chooseCountry,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.only(left: 12, right: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_country.flag, style: const TextStyle(fontSize: 19)),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  '+${_country.dialCode}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: RideTokens.ink,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              const SizedBox(width: 2),
              const Icon(Icons.keyboard_arrow_down, size: 18),
            ],
          ),
        ),
      ),
    ),
  );
}

class _ParsedPhone {
  final CountryOption country;
  final String nationalNumber;
  const _ParsedPhone(this.country, this.nationalNumber);
}

class CountryOption {
  final String name;
  final String isoCode;
  final String dialCode;
  const CountryOption({
    required this.name,
    required this.isoCode,
    required this.dialCode,
  });

  String get flag => String.fromCharCodes(
    isoCode.codeUnits.map((code) => 0x1F1E6 + code - 0x41),
  );

  static CountryOption? byIso(String isoCode) {
    for (final country in all) {
      if (country.isoCode == isoCode.toUpperCase()) return country;
    }
    return null;
  }

  // Static ISO 3166 country names/codes and ITU calling codes keep the picker
  // deterministic and available offline. Flags are rendered from ISO codes.
  static const List<CountryOption> all = [
    CountryOption(name: "India", isoCode: "IN", dialCode: "91"),
    CountryOption(name: "Afghanistan", isoCode: "AF", dialCode: "93"),
    CountryOption(name: "Albania", isoCode: "AL", dialCode: "355"),
    CountryOption(name: "Algeria", isoCode: "DZ", dialCode: "213"),
    CountryOption(name: "American Samoa", isoCode: "AS", dialCode: "1684"),
    CountryOption(name: "Andorra", isoCode: "AD", dialCode: "376"),
    CountryOption(name: "Angola", isoCode: "AO", dialCode: "244"),
    CountryOption(name: "Anguilla", isoCode: "AI", dialCode: "1264"),
    CountryOption(name: "Antarctica", isoCode: "AQ", dialCode: "672"),
    CountryOption(name: "Antigua and Barbuda", isoCode: "AG", dialCode: "1268"),
    CountryOption(name: "Argentina", isoCode: "AR", dialCode: "54"),
    CountryOption(name: "Armenia", isoCode: "AM", dialCode: "374"),
    CountryOption(name: "Aruba", isoCode: "AW", dialCode: "297"),
    CountryOption(name: "Australia", isoCode: "AU", dialCode: "61"),
    CountryOption(name: "Austria", isoCode: "AT", dialCode: "43"),
    CountryOption(name: "Azerbaijan", isoCode: "AZ", dialCode: "994"),
    CountryOption(name: "Bahamas", isoCode: "BS", dialCode: "1242"),
    CountryOption(name: "Bahrain", isoCode: "BH", dialCode: "973"),
    CountryOption(name: "Bangladesh", isoCode: "BD", dialCode: "880"),
    CountryOption(name: "Barbados", isoCode: "BB", dialCode: "1246"),
    CountryOption(name: "Belarus", isoCode: "BY", dialCode: "375"),
    CountryOption(name: "Belgium", isoCode: "BE", dialCode: "32"),
    CountryOption(name: "Belize", isoCode: "BZ", dialCode: "501"),
    CountryOption(name: "Benin", isoCode: "BJ", dialCode: "229"),
    CountryOption(name: "Bermuda", isoCode: "BM", dialCode: "1441"),
    CountryOption(name: "Bhutan", isoCode: "BT", dialCode: "975"),
    CountryOption(
      name: "Bolivia, Plurinational State of bolivia",
      isoCode: "BO",
      dialCode: "591",
    ),
    CountryOption(
      name: "Bosnia and Herzegovina",
      isoCode: "BA",
      dialCode: "387",
    ),
    CountryOption(name: "Botswana", isoCode: "BW", dialCode: "267"),
    CountryOption(name: "Bouvet Island", isoCode: "BV", dialCode: "47"),
    CountryOption(name: "Brazil", isoCode: "BR", dialCode: "55"),
    CountryOption(
      name: "British Indian Ocean Territory",
      isoCode: "IO",
      dialCode: "246",
    ),
    CountryOption(name: "Brunei Darussalam", isoCode: "BN", dialCode: "673"),
    CountryOption(name: "Bulgaria", isoCode: "BG", dialCode: "359"),
    CountryOption(name: "Burkina Faso", isoCode: "BF", dialCode: "226"),
    CountryOption(name: "Burundi", isoCode: "BI", dialCode: "257"),
    CountryOption(name: "Cabo Verde", isoCode: "CV", dialCode: "238"),
    CountryOption(name: "Cambodia", isoCode: "KH", dialCode: "855"),
    CountryOption(name: "Cameroon", isoCode: "CM", dialCode: "237"),
    CountryOption(name: "Campione d'Italia", isoCode: "IT", dialCode: "41"),
    CountryOption(name: "Canada", isoCode: "CA", dialCode: "1"),
    CountryOption(name: "Cayman Islands", isoCode: "KY", dialCode: "345"),
    CountryOption(
      name: "Central African Republic",
      isoCode: "CF",
      dialCode: "236",
    ),
    CountryOption(name: "Chad", isoCode: "TD", dialCode: "235"),
    CountryOption(name: "Chile", isoCode: "CL", dialCode: "56"),
    CountryOption(name: "China", isoCode: "CN", dialCode: "86"),
    CountryOption(name: "Christmas Island", isoCode: "CX", dialCode: "61"),
    CountryOption(
      name: "Cocos (Keeling) Islands",
      isoCode: "CC",
      dialCode: "61",
    ),
    CountryOption(name: "Colombia", isoCode: "CO", dialCode: "57"),
    CountryOption(name: "Comoros", isoCode: "KM", dialCode: "269"),
    CountryOption(name: "Congo", isoCode: "CG", dialCode: "242"),
    CountryOption(
      name: "Congo, The Democratic Republic of the Congo",
      isoCode: "CD",
      dialCode: "243",
    ),
    CountryOption(name: "Cook Islands", isoCode: "CK", dialCode: "682"),
    CountryOption(name: "Costa Rica", isoCode: "CR", dialCode: "506"),
    CountryOption(name: "Croatia", isoCode: "HR", dialCode: "385"),
    CountryOption(name: "Cuba", isoCode: "CU", dialCode: "53"),
    CountryOption(name: "Cyprus", isoCode: "CY", dialCode: "357"),
    CountryOption(name: "Czech Republic", isoCode: "CZ", dialCode: "420"),
    CountryOption(name: "Côte d'Ivoire", isoCode: "CI", dialCode: "225"),
    CountryOption(name: "Denmark", isoCode: "DK", dialCode: "45"),
    CountryOption(name: "Djibouti", isoCode: "DJ", dialCode: "253"),
    CountryOption(name: "Dominica", isoCode: "DM", dialCode: "1767"),
    CountryOption(name: "Dominican Republic", isoCode: "DO", dialCode: "1"),
    CountryOption(name: "Ecuador", isoCode: "EC", dialCode: "593"),
    CountryOption(name: "Egypt", isoCode: "EG", dialCode: "20"),
    CountryOption(name: "El Salvador", isoCode: "SV", dialCode: "503"),
    CountryOption(name: "Equatorial Guinea", isoCode: "GQ", dialCode: "240"),
    CountryOption(name: "Eritrea", isoCode: "ER", dialCode: "291"),
    CountryOption(name: "Estonia", isoCode: "EE", dialCode: "372"),
    CountryOption(name: "Eswatini", isoCode: "SZ", dialCode: "268"),
    CountryOption(name: "Ethiopia", isoCode: "ET", dialCode: "251"),
    CountryOption(
      name: "Falkland Islands (Malvinas)",
      isoCode: "FK",
      dialCode: "500",
    ),
    CountryOption(name: "Faroe Islands", isoCode: "FO", dialCode: "298"),
    CountryOption(name: "Fiji", isoCode: "FJ", dialCode: "679"),
    CountryOption(name: "Finland", isoCode: "FI", dialCode: "358"),
    CountryOption(name: "France", isoCode: "FR", dialCode: "33"),
    CountryOption(name: "French Guiana", isoCode: "GF", dialCode: "594"),
    CountryOption(name: "French Polynesia", isoCode: "PF", dialCode: "689"),
    CountryOption(
      name: "French Southern Territories",
      isoCode: "TF",
      dialCode: "262",
    ),
    CountryOption(name: "Gabon", isoCode: "GA", dialCode: "241"),
    CountryOption(name: "Gambia", isoCode: "GM", dialCode: "220"),
    CountryOption(name: "Georgia", isoCode: "GE", dialCode: "995"),
    CountryOption(name: "Germany", isoCode: "DE", dialCode: "49"),
    CountryOption(name: "Ghana", isoCode: "GH", dialCode: "233"),
    CountryOption(name: "Gibraltar", isoCode: "GI", dialCode: "350"),
    CountryOption(name: "Greece", isoCode: "GR", dialCode: "30"),
    CountryOption(name: "Greenland", isoCode: "GL", dialCode: "299"),
    CountryOption(name: "Grenada", isoCode: "GD", dialCode: "1473"),
    CountryOption(name: "Guadeloupe", isoCode: "GP", dialCode: "590"),
    CountryOption(name: "Guam", isoCode: "GU", dialCode: "1671"),
    CountryOption(name: "Guatemala", isoCode: "GT", dialCode: "502"),
    CountryOption(name: "Guernsey", isoCode: "GG", dialCode: "44"),
    CountryOption(name: "Guinea", isoCode: "GN", dialCode: "224"),
    CountryOption(name: "Guinea-Bissau", isoCode: "GW", dialCode: "245"),
    CountryOption(name: "Guyana", isoCode: "GY", dialCode: "592"),
    CountryOption(name: "Haiti", isoCode: "HT", dialCode: "509"),
    CountryOption(
      name: "Heard Island and Mcdonald Islands",
      isoCode: "HM",
      dialCode: "672",
    ),
    CountryOption(
      name: "Holy See (Vatican City State)",
      isoCode: "VA",
      dialCode: "379",
    ),
    CountryOption(name: "Honduras", isoCode: "HN", dialCode: "504"),
    CountryOption(name: "Hong Kong", isoCode: "HK", dialCode: "852"),
    CountryOption(name: "Hungary", isoCode: "HU", dialCode: "36"),
    CountryOption(name: "Iceland", isoCode: "IS", dialCode: "354"),
    CountryOption(name: "Indonesia", isoCode: "ID", dialCode: "62"),
    CountryOption(
      name: "Iran, Islamic Republic of Persian Gulf",
      isoCode: "IR",
      dialCode: "98",
    ),
    CountryOption(name: "Iraq", isoCode: "IQ", dialCode: "964"),
    CountryOption(name: "Ireland", isoCode: "IE", dialCode: "353"),
    CountryOption(name: "Isle of Man", isoCode: "IM", dialCode: "44"),
    CountryOption(name: "Israel", isoCode: "IL", dialCode: "972"),
    CountryOption(name: "Jamaica", isoCode: "JM", dialCode: "1876"),
    CountryOption(name: "Japan", isoCode: "JP", dialCode: "81"),
    CountryOption(name: "Jersey", isoCode: "JE", dialCode: "44"),
    CountryOption(name: "Jordan", isoCode: "JO", dialCode: "962"),
    CountryOption(name: "Kazakhstan", isoCode: "KZ", dialCode: "7"),
    CountryOption(name: "Kenya", isoCode: "KE", dialCode: "254"),
    CountryOption(name: "Kiribati", isoCode: "KI", dialCode: "686"),
    CountryOption(
      name: "Korea, Democratic People's Republic of Korea",
      isoCode: "KP",
      dialCode: "850",
    ),
    CountryOption(
      name: "Korea, Republic of South Korea",
      isoCode: "KR",
      dialCode: "82",
    ),
    CountryOption(name: "Kosovo", isoCode: "XK", dialCode: "383"),
    CountryOption(name: "Kuwait", isoCode: "KW", dialCode: "965"),
    CountryOption(name: "Kyrgyzstan", isoCode: "KG", dialCode: "996"),
    CountryOption(name: "Laos", isoCode: "LA", dialCode: "856"),
    CountryOption(name: "Latvia", isoCode: "LV", dialCode: "371"),
    CountryOption(name: "Lebanon", isoCode: "LB", dialCode: "961"),
    CountryOption(name: "Lesotho", isoCode: "LS", dialCode: "266"),
    CountryOption(name: "Liberia", isoCode: "LR", dialCode: "231"),
    CountryOption(
      name: "Libyan Arab Jamahiriya",
      isoCode: "LY",
      dialCode: "218",
    ),
    CountryOption(name: "Liechtenstein", isoCode: "LI", dialCode: "423"),
    CountryOption(name: "Lithuania", isoCode: "LT", dialCode: "370"),
    CountryOption(name: "Luxembourg", isoCode: "LU", dialCode: "352"),
    CountryOption(name: "Macao", isoCode: "MO", dialCode: "853"),
    CountryOption(name: "Macedonia", isoCode: "MK", dialCode: "389"),
    CountryOption(name: "Madagascar", isoCode: "MG", dialCode: "261"),
    CountryOption(name: "Malawi", isoCode: "MW", dialCode: "265"),
    CountryOption(name: "Malaysia", isoCode: "MY", dialCode: "60"),
    CountryOption(name: "Maldives", isoCode: "MV", dialCode: "960"),
    CountryOption(name: "Mali", isoCode: "ML", dialCode: "223"),
    CountryOption(name: "Malta", isoCode: "MT", dialCode: "356"),
    CountryOption(name: "Marshall Islands", isoCode: "MH", dialCode: "692"),
    CountryOption(name: "Martinique", isoCode: "MQ", dialCode: "596"),
    CountryOption(name: "Mauritania", isoCode: "MR", dialCode: "222"),
    CountryOption(name: "Mauritius", isoCode: "MU", dialCode: "230"),
    CountryOption(name: "Mayotte", isoCode: "YT", dialCode: "262"),
    CountryOption(name: "Mexico", isoCode: "MX", dialCode: "52"),
    CountryOption(
      name: "Micronesia, Federated States of Micronesia",
      isoCode: "FM",
      dialCode: "691",
    ),
    CountryOption(name: "Moldova", isoCode: "MD", dialCode: "373"),
    CountryOption(name: "Monaco", isoCode: "MC", dialCode: "377"),
    CountryOption(name: "Mongolia", isoCode: "MN", dialCode: "976"),
    CountryOption(name: "Montenegro", isoCode: "ME", dialCode: "382"),
    CountryOption(name: "Montserrat", isoCode: "MS", dialCode: "1664"),
    CountryOption(name: "Morocco", isoCode: "MA", dialCode: "212"),
    CountryOption(name: "Mozambique", isoCode: "MZ", dialCode: "258"),
    CountryOption(name: "Myanmar", isoCode: "MM", dialCode: "95"),
    CountryOption(name: "Namibia", isoCode: "NA", dialCode: "264"),
    CountryOption(name: "Nauru", isoCode: "NR", dialCode: "674"),
    CountryOption(name: "Nepal", isoCode: "NP", dialCode: "977"),
    CountryOption(name: "Netherlands", isoCode: "NL", dialCode: "31"),
    CountryOption(name: "New Caledonia", isoCode: "NC", dialCode: "687"),
    CountryOption(name: "New Zealand", isoCode: "NZ", dialCode: "64"),
    CountryOption(name: "Nicaragua", isoCode: "NI", dialCode: "505"),
    CountryOption(name: "Niger", isoCode: "NE", dialCode: "227"),
    CountryOption(name: "Nigeria", isoCode: "NG", dialCode: "234"),
    CountryOption(name: "Niue", isoCode: "NU", dialCode: "683"),
    CountryOption(name: "Norfolk Island", isoCode: "NF", dialCode: "672"),
    CountryOption(
      name: "Northern Mariana Islands",
      isoCode: "MP",
      dialCode: "1670",
    ),
    CountryOption(name: "Norway", isoCode: "NO", dialCode: "47"),
    CountryOption(name: "Oman", isoCode: "OM", dialCode: "968"),
    CountryOption(name: "Pakistan", isoCode: "PK", dialCode: "92"),
    CountryOption(name: "Palau", isoCode: "PW", dialCode: "680"),
    CountryOption(
      name: "Palestinian Territory, Occupied",
      isoCode: "PS",
      dialCode: "970",
    ),
    CountryOption(name: "Panama", isoCode: "PA", dialCode: "507"),
    CountryOption(name: "Papua New Guinea", isoCode: "PG", dialCode: "675"),
    CountryOption(name: "Paraguay", isoCode: "PY", dialCode: "595"),
    CountryOption(name: "Peru", isoCode: "PE", dialCode: "51"),
    CountryOption(name: "Philippines", isoCode: "PH", dialCode: "63"),
    CountryOption(name: "Pitcairn", isoCode: "PN", dialCode: "64"),
    CountryOption(name: "Poland", isoCode: "PL", dialCode: "48"),
    CountryOption(name: "Portugal", isoCode: "PT", dialCode: "351"),
    CountryOption(name: "Puerto Rico", isoCode: "PR", dialCode: "1939"),
    CountryOption(name: "Qatar", isoCode: "QA", dialCode: "974"),
    CountryOption(name: "Reunion", isoCode: "RE", dialCode: "262"),
    CountryOption(name: "Romania", isoCode: "RO", dialCode: "40"),
    CountryOption(name: "Russia", isoCode: "RU", dialCode: "7"),
    CountryOption(name: "Rwanda", isoCode: "RW", dialCode: "250"),
    CountryOption(name: "Saint Barthelemy", isoCode: "BL", dialCode: "590"),
    CountryOption(
      name: "Saint Helena, Ascension and Tristan Da Cunha",
      isoCode: "SH",
      dialCode: "290",
    ),
    CountryOption(
      name: "Saint Kitts and Nevis",
      isoCode: "KN",
      dialCode: "1869",
    ),
    CountryOption(name: "Saint Lucia", isoCode: "LC", dialCode: "1758"),
    CountryOption(name: "Saint Martin", isoCode: "MF", dialCode: "590"),
    CountryOption(
      name: "Saint Pierre and Miquelon",
      isoCode: "PM",
      dialCode: "508",
    ),
    CountryOption(
      name: "Saint Vincent and the Grenadines",
      isoCode: "VC",
      dialCode: "1784",
    ),
    CountryOption(name: "Samoa", isoCode: "WS", dialCode: "685"),
    CountryOption(name: "San Marino", isoCode: "SM", dialCode: "378"),
    CountryOption(
      name: "Sao Tome and Principe",
      isoCode: "ST",
      dialCode: "239",
    ),
    CountryOption(name: "Saudi Arabia", isoCode: "SA", dialCode: "966"),
    CountryOption(name: "Senegal", isoCode: "SN", dialCode: "221"),
    CountryOption(name: "Serbia", isoCode: "RS", dialCode: "381"),
    CountryOption(name: "Seychelles", isoCode: "SC", dialCode: "248"),
    CountryOption(name: "Sierra Leone", isoCode: "SL", dialCode: "232"),
    CountryOption(name: "Singapore", isoCode: "SG", dialCode: "65"),
    CountryOption(name: "Slovakia", isoCode: "SK", dialCode: "421"),
    CountryOption(name: "Slovenia", isoCode: "SI", dialCode: "386"),
    CountryOption(name: "Solomon Islands", isoCode: "SB", dialCode: "677"),
    CountryOption(name: "Somalia", isoCode: "SO", dialCode: "252"),
    CountryOption(name: "South Africa", isoCode: "ZA", dialCode: "27"),
    CountryOption(
      name: "South Georgia and the South Sandwich Islands",
      isoCode: "GS",
      dialCode: "500",
    ),
    CountryOption(name: "South Sudan", isoCode: "SS", dialCode: "211"),
    CountryOption(name: "Spain", isoCode: "ES", dialCode: "34"),
    CountryOption(name: "Sri Lanka", isoCode: "LK", dialCode: "94"),
    CountryOption(name: "Sudan", isoCode: "SD", dialCode: "249"),
    CountryOption(name: "Suriname", isoCode: "SR", dialCode: "597"),
    CountryOption(
      name: "Svalbard and Jan Mayen",
      isoCode: "SJ",
      dialCode: "47",
    ),
    CountryOption(name: "Sweden", isoCode: "SE", dialCode: "46"),
    CountryOption(name: "Switzerland", isoCode: "CH", dialCode: "41"),
    CountryOption(name: "Syrian Arab Republic", isoCode: "SY", dialCode: "963"),
    CountryOption(name: "Taiwan", isoCode: "TW", dialCode: "886"),
    CountryOption(name: "Tajikistan", isoCode: "TJ", dialCode: "992"),
    CountryOption(
      name: "Tanzania, United Republic of Tanzania",
      isoCode: "TZ",
      dialCode: "255",
    ),
    CountryOption(name: "Thailand", isoCode: "TH", dialCode: "66"),
    CountryOption(name: "Timor-Leste", isoCode: "TL", dialCode: "670"),
    CountryOption(name: "Togo", isoCode: "TG", dialCode: "228"),
    CountryOption(name: "Tokelau", isoCode: "TK", dialCode: "690"),
    CountryOption(name: "Tonga", isoCode: "TO", dialCode: "676"),
    CountryOption(name: "Trinidad and Tobago", isoCode: "TT", dialCode: "1868"),
    CountryOption(name: "Tunisia", isoCode: "TN", dialCode: "216"),
    CountryOption(name: "Turkey", isoCode: "TR", dialCode: "90"),
    CountryOption(name: "Turkmenistan", isoCode: "TM", dialCode: "993"),
    CountryOption(
      name: "Turks and Caicos Islands",
      isoCode: "TC",
      dialCode: "1649",
    ),
    CountryOption(name: "Tuvalu", isoCode: "TV", dialCode: "688"),
    CountryOption(name: "Uganda", isoCode: "UG", dialCode: "256"),
    CountryOption(name: "Ukraine", isoCode: "UA", dialCode: "380"),
    CountryOption(name: "United Arab Emirates", isoCode: "AE", dialCode: "971"),
    CountryOption(name: "United Kingdom", isoCode: "GB", dialCode: "44"),
    CountryOption(name: "United States", isoCode: "US", dialCode: "1"),
    CountryOption(name: "Uruguay", isoCode: "UY", dialCode: "598"),
    CountryOption(name: "Uzbekistan", isoCode: "UZ", dialCode: "998"),
    CountryOption(name: "Vanuatu", isoCode: "VU", dialCode: "678"),
    CountryOption(
      name: "Venezuela, Bolivarian Republic of Venezuela",
      isoCode: "VE",
      dialCode: "58",
    ),
    CountryOption(name: "Vietnam", isoCode: "VN", dialCode: "84"),
    CountryOption(
      name: "Virgin Islands, British",
      isoCode: "VG",
      dialCode: "1284",
    ),
    CountryOption(
      name: "Virgin Islands, U.S.",
      isoCode: "VI",
      dialCode: "1340",
    ),
    CountryOption(name: "Wallis and Futuna", isoCode: "WF", dialCode: "681"),
    CountryOption(name: "Yemen", isoCode: "YE", dialCode: "967"),
    CountryOption(name: "Zambia", isoCode: "ZM", dialCode: "260"),
    CountryOption(name: "Zimbabwe", isoCode: "ZW", dialCode: "263"),
    CountryOption(name: "Åland Islands", isoCode: "AX", dialCode: "358"),
  ];
}

class _CountryPickerSheet extends StatefulWidget {
  final CountryOption selected;
  const _CountryPickerSheet({required this.selected});

  @override
  State<_CountryPickerSheet> createState() => _CountryPickerSheetState();
}

class _CountryPickerSheetState extends State<_CountryPickerSheet> {
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final query = _query.trim().toLowerCase();
    final countries = CountryOption.all
        .where(
          (country) =>
              query.isEmpty ||
              country.name.toLowerCase().contains(query) ||
              country.isoCode.toLowerCase().contains(query) ||
              country.dialCode.contains(query.replaceFirst('+', '')),
        )
        .toList();
    return SolidSheet(
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * .78,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 0, 20, 14),
                child: Text(
                  'Select country',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w500,
                    color: RideTokens.ink,
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 0, 18, 12),
                child: SolidTextFormField(
                  controller: _search,
                  label: '',
                  hint: 'Search country or code',
                  showLabel: false,
                  keyboardType: TextInputType.text,
                  textCapitalization: TextCapitalization.none,
                  prefixIcon: const Icon(Icons.search, size: 20),
                  onChanged: (value) => setState(() => _query = value),
                ),
              ),
              Expanded(
                child: ListView.separated(
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  itemCount: countries.length,
                  separatorBuilder: (_, _) =>
                      const Divider(height: 1, color: Color(0xFFEEEEEE)),
                  itemBuilder: (context, index) {
                    final country = countries[index];
                    final selected = country.isoCode == widget.selected.isoCode;
                    return ListTile(
                      dense: true,
                      leading: Text(
                        country.flag,
                        style: const TextStyle(fontSize: 22),
                      ),
                      title: Text(
                        country.name,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w400,
                        ),
                      ),
                      subtitle: Text(
                        country.isoCode,
                        style: const TextStyle(
                          fontSize: 11,
                          color: RideTokens.muted,
                        ),
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            '+${country.dialCode}',
                            style: const TextStyle(
                              fontSize: 14,
                              color: RideTokens.ink,
                            ),
                          ),
                          if (selected) ...[
                            const SizedBox(width: 8),
                            const Icon(
                              Icons.check,
                              size: 18,
                              color: RideTokens.ink,
                            ),
                          ],
                        ],
                      ),
                      onTap: () => Navigator.pop(context, country),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
