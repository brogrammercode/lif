import 'package:user/core/state/feature_controller.dart';
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

/// Owns feature records, query state and asynchronous loading independently of its view.
class RideHistoryFilterController extends FeatureController {
  RideHistoryFilterController(
    this.repository,
    this.category,
    this.categoryName,
    String? initialMonth,
  ) {
    month = initialMonth?.split('-').last ?? '';
    year = initialMonth?.split('-').first ?? '${DateTime.now().year}';
  }
  final UserAppRepository repository;
  late Future<List<Map<String, dynamic>>> categories = repository
      .vehicleCategories();
  String? category;
  String? categoryName;
  late String month;
  late String year;
}
