import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';
import 'package:user/features/driver_vehicles/widgets/catalog_suggestion_form.dart';

class CatalogSelector extends StatefulWidget {
  final Map<String, dynamic>? brand;
  const CatalogSelector({super.key, this.brand});
  @override
  State<CatalogSelector> createState() => _CatalogSelectorState();
}

class _CatalogSelectorState extends State<CatalogSelector> {
  final _repo = VehicleVerificationRepository();
  final _query = TextEditingController();
  Map<String, dynamic>? _data;
  String? _error;
  bool _loading = true;
  int _page = 1;
  int _request = 0;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final request = ++_request;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await _repo.choices(
        brandId: widget.brand?['id'] as String?,
        query: _query.text.trim(),
        page: _page,
      );
      if (mounted && request == _request) setState(() => _data = data);
    } catch (error) {
      if (mounted && request == _request) {
        setState(() => _error = ApiResult.errorMessage(error));
      }
    } finally {
      if (mounted && request == _request) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => AppPage(
    title: widget.brand == null ? 'Select brand' : 'Select model',
    child: Column(
      children: [
        TextField(
          controller: _query,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            labelText: 'Search ${widget.brand == null ? 'brands' : 'models'}',
            suffixIcon: IconButton(
              tooltip: 'Search',
              onPressed: () {
                _page = 1;
                _load();
              },
              icon: const Icon(Icons.search),
            ),
          ),
          onSubmitted: (_) {
            _page = 1;
            _load();
          },
        ),
        const SizedBox(height: 12),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
              ? AppLoadError(message: _error!, onRetry: _load)
              : ListView(
                  children: [
                    if (vehicleMaps(_data?['rows']).isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(
                          'No matching entries. You can suggest one below.',
                        ),
                      ),
                    for (final row in vehicleMaps(_data?['rows']))
                      ListTile(
                        leading: row['logo_url'] is String
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: Image.network(
                                  row['logo_url'] as String,
                                  width: 40,
                                  height: 40,
                                  fit: BoxFit.contain,
                                  errorBuilder: (_, error, stack) =>
                                      const Icon(Icons.directions_car_outlined),
                                ),
                              )
                            : Icon(
                                [
                                      'BIKE',
                                      'SCOOTER',
                                    ].contains(row['vehicle_type'])
                                    ? Icons.two_wheeler
                                    : Icons.directions_car_outlined,
                              ),
                        title: Text('${row['name']}'),
                        subtitle: Text(
                          row['status'] == 'REQUESTED'
                              ? 'Your request · awaiting review'
                              : 'Verified',
                        ),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => Navigator.pop(context, row),
                      ),
                  ],
                ),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            TextButton(
              onPressed: _loading || _page == 1
                  ? null
                  : () {
                      _page--;
                      _load();
                    },
              child: const Text('Previous'),
            ),
            Text('Page $_page'),
            TextButton(
              onPressed:
                  _loading || _page * 50 >= ((_data?['total'] as num?) ?? 0)
                  ? null
                  : () {
                      _page++;
                      _load();
                    },
              child: const Text('Next'),
            ),
          ],
        ),
        SafeArea(
          top: false,
          child: FilledButton.icon(
            onPressed: _loading
                ? null
                : () async {
                    final result = await Navigator.push<Map<String, dynamic>>(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            CatalogSuggestionForm(brand: widget.brand),
                      ),
                    );
                    if (result != null && context.mounted) {
                      Navigator.pop(context, result);
                    }
                  },
            icon: const Icon(Icons.add),
            label: Text(
              'Suggest a ${widget.brand == null ? 'brand' : 'model'}',
            ),
          ),
        ),
        const SizedBox(height: 16),
      ],
    ),
  );
}
