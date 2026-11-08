import 'package:user/features/driver_vehicles/controllers/catalog_selector_controller.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/liquid_glass.dart';
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
      color: GlassTokens.accent,
      size: 22,
    );
    return LiquidGlassSurface(
      radius: 99,
      padding: const EdgeInsets.all(8),
      child: SizedBox.square(
        dimension: 30,
        child: row['logo_url'] is String
            ? ClipOval(
                child: Image.network(
                  row['logo_url'] as String,
                  fit: BoxFit.contain,
                  errorBuilder: (_, _, _) => fallback,
                ),
              )
            : fallback,
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
  Widget build(BuildContext context) => AppPage(
    glass: true,
    title: widget.brand == null ? 'Select brand' : 'Select model',
    child: Column(
      children: [
        DriverPageIntro(
          icon: widget.brand == null
              ? Icons.branding_watermark_outlined
              : Icons.directions_car_filled_outlined,
          title: widget.brand == null
              ? 'Choose your vehicle brand'
              : '${widget.brand!['name']} models',
          description: widget.brand == null
              ? 'Verified brands and your own pending requests are available here.'
              : 'Choose a compatible model or suggest the missing model for review.',
        ),
        const SizedBox(height: 16),
        LiquidGlassSurface(
          padding: EdgeInsets.zero,
          radius: 20,
          child: TextField(
            controller: _query,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              labelText: 'Search ${widget.brand == null ? 'brands' : 'models'}',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: IconButton(
                tooltip: 'Search',
                onPressed: _loading
                    ? null
                    : () {
                        _page = 1;
                        _load();
                      },
                icon: const Icon(Icons.arrow_forward_rounded),
              ),
            ),
            onSubmitted: (_) {
              _page = 1;
              _load();
            },
          ),
        ),
        const SizedBox(height: 16),
        Expanded(
          child: _loading
              ? const DriverListSkeleton(rows: 5, summary: false)
              : _error != null
              ? AppLoadError(message: _error!, onRetry: _load)
              : ListView(
                  padding: const EdgeInsets.only(bottom: 12),
                  children: [
                    if (vehicleMaps(_data?['rows']).isEmpty)
                      const AppEmptyState(
                        icon: Icons.search_off_rounded,
                        title: 'No matching catalog entry',
                        subtitle:
                            'Try another search or suggest the missing entry below.',
                      ),
                    for (final row in vehicleMaps(_data?['rows']))
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: DriverLinkTile(
                          icon: Icons.directions_car_filled_outlined,
                          leading: _logo(row),
                          title: '${row['name']}',
                          subtitle: _subtitle(row),
                          trailing: DriverStatusPill(
                            label: row['status'] == 'REQUESTED'
                                ? 'Requested'
                                : 'Verified',
                            status: '${row['status']}',
                          ),
                          onTap: () => Navigator.pop(context, row),
                        ),
                      ),
                  ],
                ),
        ),
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
                style: const TextStyle(color: GlassTokens.muted),
              ),
            ),
            TextButton.icon(
              onPressed:
                  _loading || _page * 50 >= ((_data?['total'] as num?) ?? 0)
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
          child: SizedBox(
            width: double.infinity,
            child: LiquidGlassButton(
              onPressed: _loading ? null : _suggest,
              icon: const Icon(Icons.add_rounded),
              text: 'Suggest a ${widget.brand == null ? 'brand' : 'model'}',
            ),
          ),
        ),
        const SizedBox(height: 16),
      ],
    ),
  );
}
