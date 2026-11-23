import 'package:user/features/driver_vehicles/controllers/catalog_selector_controller.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/driver_operations/widgets/driver_glass.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';
import 'package:user/features/driver_vehicles/widgets/catalog_suggestion_form.dart';

class CatalogSelector extends StatefulWidget {
  final Map<String, dynamic>? brand;
  const CatalogSelector({super.key, this.brand});
  @override
  State<CatalogSelector> createState() => _CatalogSelectorState();
}

class _CatalogSelectorState extends State<CatalogSelector> {
  late final _controller = CatalogSelectorController()
    ..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  final _query = TextEditingController();
  Map<String, dynamic>? get _data => _controller.data;
  String? get _error => _controller.error;
  bool get _loading => _controller.loading;
  int get _page => _controller.page;
  set _page(int value) => _controller.page = value;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    _query.dispose();
    super.dispose();
  }

  Future<void> _load() {
    _controller.brandId = widget.brand?['id'] as String?;
    _controller.query = _query.text.trim();
    return _controller.load();
  }

  Future<void> _suggest() async {
    final result = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(
        builder: (_) => CatalogSuggestionForm(brand: widget.brand),
      ),
    );
    if (result != null && mounted) Navigator.pop(context, result);
  }

  Widget _logo(Map<String, dynamic> row) {
    final fallback = Icon(
      ['BIKE', 'SCOOTER'].contains(row['vehicle_type'])
          ? Icons.two_wheeler_rounded
          : Icons.directions_car_filled_outlined,
      color: RideTokens.ink,
      size: 25,
    );
    return Container(
      width: 62,
      height: 62,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        border: Border.all(color: RideTokens.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: row['logo_url'] is String
          ? Image.network(
              row['logo_url'] as String,
              fit: BoxFit.contain,
              errorBuilder: (_, _, _) => fallback,
            )
          : fallback,
    );
  }

  Widget _modelTile(Map<String, dynamic> row) {
    final verified = row['status'] == 'VERIFIED';
    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: RideTokens.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => Navigator.pop(context, row),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          child: Row(
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  _logo(row),
                  if (verified)
                    Positioned(
                      right: -2,
                      bottom: -2,
                      child: Container(
                        width: 22,
                        height: 22,
                        decoration: BoxDecoration(
                          color: const Color(0xFF168447),
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                        child: const Icon(
                          Icons.check_rounded,
                          size: 14,
                          color: Colors.white,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${row['name']}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: RideTokens.ink,
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      _subtitle(row),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: RideTokens.muted,
                        fontSize: 12,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.chevron_right_rounded,
                color: RideTokens.muted,
                size: 22,
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _subtitle(Map<String, dynamic> row) {
    if (row['status'] == 'REQUESTED') {
      return 'Your request is awaiting admin review';
    }
    if (widget.brand == null) return 'Verified vehicle brand';
    return [
      if (row['vehicle_type'] != null)
        '${row['vehicle_type']}'.replaceAll('_', ' '),
      if (row['fuel_type'] != null) '${row['fuel_type']}'.replaceAll('_', ' '),
      if (row['seating_capacity'] != null)
        '${row['seating_capacity']} passenger seats',
    ].join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final rows = vehicleMaps(_data?['rows']);
    final total = (_data?['total'] as num?)?.toInt() ?? 0;
    return AppPage(
      title: widget.brand == null ? 'Select Vehicle' : 'Select Model',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 18, bottom: 14),
            child: Text(
              widget.brand == null
                  ? 'Choose a vehicle brand'
                  : '${widget.brand!['name']} models',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w500,
                color: RideTokens.ink,
              ),
            ),
          ),
          SolidTextFormField(
            controller: _query,
            label: '',
            showLabel: false,
            hint: 'Search ${widget.brand == null ? 'brands' : 'models'}',
            prefixIcon: const Icon(Icons.search_rounded, size: 20),
            textInputAction: TextInputAction.search,
            onFieldSubmitted: (_) {
              _page = 1;
              _load();
            },
          ),
          const SizedBox(height: 14),
          Expanded(
            child: _loading
                ? const DriverListSkeleton(rows: 5, summary: false)
                : _error != null
                ? AppLoadError(message: _error!, onRetry: _load)
                : rows.isEmpty
                ? AppEmptyState(
                    icon: Icons.search_off_rounded,
                    title:
                        'No matching ${widget.brand == null ? 'brands' : 'models'}',
                    subtitle: 'Try another search or suggest one for review.',
                  )
                : widget.brand == null
                ? GridView.builder(
                    padding: const EdgeInsets.only(bottom: 12),
                    itemCount: rows.length,
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 3,
                          crossAxisSpacing: 10,
                          mainAxisSpacing: 10,
                          childAspectRatio: .78,
                        ),
                    itemBuilder: (context, index) {
                      final row = rows[index];
                      return Material(
                        color: Colors.white,
                        shape: RoundedRectangleBorder(
                          side: const BorderSide(color: RideTokens.line),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          onTap: () => Navigator.pop(context, row),
                          child: Padding(
                            padding: const EdgeInsets.all(10),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                _logo(row),
                                const SizedBox(height: 9),
                                Text(
                                  '${row['name']}',
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                    color: RideTokens.ink,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  )
                : ListView.separated(
                    padding: const EdgeInsets.only(bottom: 12),
                    itemCount: rows.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 9),
                    itemBuilder: (context, index) => _modelTile(rows[index]),
                  ),
          ),
          if (total > 50)
            Row(
              children: [
                TextButton.icon(
                  onPressed: _loading || _page == 1
                      ? null
                      : () {
                          _page--;
                          _load();
                        },
                  icon: const Icon(Icons.chevron_left_rounded),
                  label: const Text('Previous'),
                ),
                Expanded(
                  child: Text(
                    'Page $_page',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: RideTokens.muted),
                  ),
                ),
                TextButton.icon(
                  onPressed: _loading || _page * 50 >= total
                      ? null
                      : () {
                          _page++;
                          _load();
                        },
                  iconAlignment: IconAlignment.end,
                  icon: const Icon(Icons.chevron_right_rounded),
                  label: const Text('Next'),
                ),
              ],
            ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 12),
              child: SizedBox(
                width: double.infinity,
                height: 52,
                child: SolidButton(
                  text: 'Suggest a ${widget.brand == null ? 'brand' : 'model'}',
                  icon: const Icon(Icons.add_rounded),
                  onPressed: _loading ? null : _suggest,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
