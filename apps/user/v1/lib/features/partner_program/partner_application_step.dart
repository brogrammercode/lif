/// Presentation groups follow the server's order and retain opaque category IDs.
/// Legacy snapshots without an ID are grouped by their exact category name.
class PartnerApplicationStep {
  final String key;
  final String title;
  final List<Map<String, dynamic>> fields;

  const PartnerApplicationStep(this.key, this.title, this.fields);

  static List<PartnerApplicationStep> fromRequirements(
    List<Map<String, dynamic>> definitions,
  ) {
    final groups = <String, PartnerApplicationStep>{};
    for (final definition in definitions) {
      final category = definition['category'];
      final name = category is Map ? category['name'] : null;
      final id = category is Map ? category['id'] : null;
      final key = id != null
          ? 'category:$id'
          : name != null
          ? 'name:$name'
          : 'uncategorized';
      final group = groups.putIfAbsent(
        key,
        () => PartnerApplicationStep(
          key,
          name == null || '$name'.trim().isEmpty ? 'Requirements' : '$name',
          [],
        ),
      );
      group.fields.add(definition);
    }
    return [
      const PartnerApplicationStep('contact', 'Contact and delivery', []),
      ...groups.values,
    ];
  }
}
