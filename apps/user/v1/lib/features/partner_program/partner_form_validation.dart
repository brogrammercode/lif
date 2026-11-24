bool isEmailPartnerRequirement(Map<String, dynamic> definition) {
  final kind = '${definition['input_kind'] ?? 'DEFAULT'}';
  final semanticName = '${definition['key'] ?? ''} ${definition['label']}'
      .replaceAllMapped(
        RegExp(r'([a-z0-9])([A-Z])'),
        (match) => '${match[1]}_${match[2]}',
      )
      .toLowerCase();
  return kind == 'EMAIL' ||
      RegExp(r'(^|[^a-z])(e_?mail)([^a-z]|$)').hasMatch(semanticName);
}

bool isValidEmailAddress(String value) {
  final email = value.trim();
  if (email.length > 254 || email.contains('..')) return false;
  final at = email.lastIndexOf('@');
  if (at < 1 || at > 64 || at == email.length - 1) return false;
  final local = email.substring(0, at);
  if (local.startsWith('.') || local.endsWith('.')) return false;
  return RegExp(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$",
  ).hasMatch(email);
}

bool isPhonePartnerRequirement(Map<String, dynamic> definition) {
  final kind = '${definition['input_kind'] ?? 'DEFAULT'}';
  final semanticName = '${definition['key'] ?? ''} ${definition['label']}'
      .replaceAllMapped(
        RegExp(r'([a-z0-9])([A-Z])'),
        (match) => '${match[1]}_${match[2]}',
      )
      .toLowerCase();
  return kind == 'PHONE' ||
      RegExp(
        r'(^|[^a-z])(phone|mobile|whats_?app|telephone|tel)([^a-z]|$)',
      ).hasMatch(semanticName);
}

/// Validates supplied draft values, including fields outside the mounted step.
/// Final submission must include all categories; FormState sees mounted fields.
String? validatePartnerDraft(
  List<Map<String, dynamic>> definitions,
  Map<String, dynamic> values, {
  required String email,
  required String phone,
  bool validateContacts = true,
}) {
  if (validateContacts && !isValidEmailAddress(email)) {
    return 'Enter a valid contact email address.';
  }
  if (validateContacts &&
      !RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(phone.trim())) {
    return 'Include + and your country code in the WhatsApp number.';
  }
  for (final definition in definitions) {
    final id = '${definition['id']}';
    final label = '${definition['label']}';
    final value = values[id];
    final empty =
        value == null || value == '' || (value is List && value.isEmpty);
    if (empty) {
      if (definition['is_required'] == true) return '$label is required.';
      continue;
    }
    final type = definition['field_type'];
    final kind = definition['input_kind'];
    final phoneField = isPhonePartnerRequirement(definition);
    final emailField = isEmailPartnerRequirement(definition);
    if (['FILE', 'IMAGE', 'PDF'].contains(type)) {
      if (value is! List ||
          value.length > (definition['allow_multiple'] == true ? 10 : 1)) {
        return 'Check the number of files for $label.';
      }
      continue;
    }
    if (type == 'BOOLEAN') {
      if (value is! bool) return 'Choose yes or no for $label.';
      continue;
    }
    final text = '$value'.trim();
    if (phoneField && !RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(text)) {
      return 'Enter a valid phone number with its country calling code for $label.';
    }
    if (emailField && !isValidEmailAddress(text)) {
      return 'Enter a valid email address for $label.';
    }
    final maxLength = (definition['max_length'] as num?)?.toInt() ?? 10000;
    if (text.length > maxLength) {
      return '$label allows at most $maxLength characters.';
    }
    if (type == 'NUMBER' && !phoneField && !emailField) {
      final number = num.tryParse(text);
      if (number == null || !number.isFinite) {
        return 'Enter a valid number for $label.';
      }
      final min = definition['min_value'] as num?;
      final max = definition['max_value'] as num?;
      if (min != null && number < min) return '$label must be at least $min.';
      if (max != null && number > max) return '$label must be at most $max.';
    }
    if (type == 'DATE' || kind == 'DOB') {
      final date = DateTime.tryParse(text);
      final now = DateTime.now();
      if (date == null ||
          date.toIso8601String().substring(0, 10) != text ||
          (kind == 'DOB' &&
              (date.year < 1900 ||
                  date.isAfter(DateTime(now.year, now.month, now.day))))) {
        return 'Choose a valid ${kind == 'DOB' ? 'date of birth on or before today' : 'date'} for $label.';
      }
    }
    if (kind == 'IFSC' && !RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$').hasMatch(text)) {
      return 'Enter a valid 11-character IFSC code for $label.';
    }
    if (kind == 'UPI' &&
        !RegExp(
          r'^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}@[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,62}[a-zA-Z0-9])$',
        ).hasMatch(text)) {
      return 'Enter a valid UPI ID for $label, for example name@bank.';
    }
    if (kind == 'GENDER' || kind == 'OWNERSHIP') {
      final options = definition['options'];
      if (options is! List ||
          !options.any(
            (option) => '$option'.toLowerCase() == text.toLowerCase(),
          )) {
        return 'Choose an available option for $label.';
      }
    }
  }
  return null;
}
