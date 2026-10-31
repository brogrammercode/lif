import 'package:flutter/material.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/components/ui/glass_dropdown.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/features/user_app/user_app.repo.dart';

const rideMonths = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
String rideMonthLabel(String month) {
  final parts = month.split('-');
  final index = int.tryParse(parts.last) ?? 0;
  return parts.length == 2 && index >= 1 && index <= 12
      ? '${rideMonths[index - 1]} ${parts.first}'
      : month;
}

class RideHistoryFilter {
  final String? categoryId, categoryName, month;
  const RideHistoryFilter({this.categoryId, this.categoryName, this.month});
}

class RideHistoryFilters extends StatefulWidget {
  final UserAppRepository repository;
  final RideHistoryFilter initial;
  const RideHistoryFilters({
    super.key,
    required this.repository,
    required this.initial,
  });
  @override
  State<RideHistoryFilters> createState() => _RideHistoryFiltersState();
}

class _RideHistoryFiltersState extends State<RideHistoryFilters> {
  late Future<List<Map<String, dynamic>>> _categories = widget.repository
      .vehicleCategories();
  late String? _category = widget.initial.categoryId;
  late String? _categoryName = widget.initial.categoryName;
  late String _month = widget.initial.month?.split('-').last ?? '';
  late String _year =
      widget.initial.month?.split('-').first ?? '${DateTime.now().year}';
  List<int> get _years => {
    int.parse(_year),
    ...List.generate(
      DateTime.now().year - 1999,
      (index) => DateTime.now().year - index,
    ),
  }.toList()..sort((a, b) => b.compareTo(a));
  @override
  Widget build(BuildContext context) => LiquidGlassSheet(
    child: SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        20,
        4,
        20,
        20 + MediaQuery.paddingOf(context).bottom,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Filter rides',
                  style: TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w600,
                    color: GlassTokens.ink,
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Close filters',
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          const SizedBox(height: 20),
          FutureBuilder<List<Map<String, dynamic>>>(
            future: _categories,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const LiquidGlassSurface(
                  child: AppSkeleton(
                    label: 'Loading categories',
                    child: SkeletonBox(height: 24),
                  ),
                );
              }
              final categories = (snapshot.data ?? [])
                  .where((category) => category['is_selectable'] != false)
                  .toList();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  LiquidGlassDropdownFormField<String>(
                    initialValue: _category ?? '',
                    decoration: const InputDecoration(
                      labelText: 'Vehicle category',
                    ),
                    items: [
                      const DropdownMenuItem(
                        value: '',
                        child: Text('All categories'),
                      ),
                      if (_category != null &&
                          !categories.any(
                            (category) => '${category['id']}' == _category,
                          ))
                        DropdownMenuItem(
                          value: _category,
                          child: Text(_categoryName ?? 'Selected category'),
                        ),
                      for (final category in categories)
                        DropdownMenuItem(
                          value: '${category['id']}',
                          child: Text('${category['name']}'),
                        ),
                    ],
                    onChanged: (value) => setState(() {
                      _category = value == '' ? null : value;
                      _categoryName =
                          categories
                                  .where(
                                    (category) => '${category['id']}' == value,
                                  )
                                  .firstOrNull?['name']
                              as String? ??
                          _categoryName;
                    }),
                  ),
                  if (snapshot.hasError) ...[
                    const SizedBox(height: 8),
                    const Text(
                      'Categories could not load. Date filtering is still available.',
                      style: TextStyle(fontSize: 12, color: GlassTokens.muted),
                    ),
                    TextButton(
                      onPressed: () => setState(
                        () =>
                            _categories = widget.repository.vehicleCategories(),
                      ),
                      child: const Text('Retry categories'),
                    ),
                  ],
                ],
              );
            },
          ),
          const SizedBox(height: 20),
          LiquidGlassDropdownFormField<String>(
            initialValue: _month,
            decoration: const InputDecoration(labelText: 'Month'),
            items: [
              const DropdownMenuItem(value: '', child: Text('All months')),
              for (var month = 1; month <= 12; month++)
                DropdownMenuItem(
                  value: '$month'.padLeft(2, '0'),
                  child: Text(rideMonths[month - 1]),
                ),
            ],
            onChanged: (value) => setState(() => _month = value ?? ''),
          ),
          if (_month.isNotEmpty) ...[
            const SizedBox(height: 20),
            LiquidGlassDropdownFormField<String>(
              initialValue: _year,
              decoration: const InputDecoration(labelText: 'Year'),
              items: [
                for (final year in _years)
                  DropdownMenuItem(value: '$year', child: Text('$year')),
              ],
              onChanged: (value) => setState(() => _year = value ?? _year),
            ),
          ],
          const SizedBox(height: 12),
          const Text(
            'Month boundaries use India time (IST).',
            style: TextStyle(fontSize: 12, color: GlassTokens.muted),
          ),
          const SizedBox(height: 24),
          AppButton(
            text: 'Apply filters',
            onPressed: () => Navigator.pop(
              context,
              RideHistoryFilter(
                categoryId: _category,
                categoryName: _categoryName,
                month: _month.isEmpty ? null : '$_year-$_month',
              ),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, const RideHistoryFilter()),
            child: const Text('Reset filters'),
          ),
        ],
      ),
    ),
  );
}
