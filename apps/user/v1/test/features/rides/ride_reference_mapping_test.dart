import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/components/ui/glass_dropdown.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/rides/pages/ride_detail_page.dart';
import 'package:user/features/rides/pages/rides_page.dart';
import 'package:user/features/rides/ride_detail_intent.dart';
import 'package:user/features/rides/ride_fare_summary.dart';
import 'package:user/features/rides/widgets/ride_glass.dart';
import 'package:user/features/rides/widgets/trip_safety_sheet.dart';
import 'package:user/features/user_app/user_app.repo.dart';
import '../partner_program/partner_glass_test.dart' as glass;
import '../partner_program/partner_submission_test.dart' as fixtures;
import 'rides_glass_test.dart' as completed;

const unfulfilled = <String, dynamic>{
  'id': '9007199254740993123',
  'status': 'NO_DRIVER_FOUND',
  'created_at': '2026-10-31T05:30:00Z',
  'requested_at': '2026-10-31T05:30:00Z',
  'pickup_address': 'Station, Bhagalpur',
  'dropoff_address': 'University, Bhagalpur',
  'pickup_latitude': '25.23',
  'pickup_longitude': '86.95',
  'dropoff_latitude': '25.24',
  'dropoff_longitude': '86.96',
  'estimated_fare': '64',
  'estimated_distance_m': '5000',
  'estimated_duration_s': 720,
  'collection_preference': 'CASH',
  'quotes': [
    {
      'vehicle_type': 'BIKE',
      'category_snapshot': {'name': 'Local Bike'},
    },
  ],
};

class MappingRepo extends UserAppRepository {
  final requests = <Map<String, dynamic>>[];
  final pending = <String, Completer<Map<String, dynamic>>>{};
  int catalogReads = 0;
  String status = 'NO_DRIVER_FOUND';
  Map<String, dynamic> result(String query) => {
    'page': 1,
    'page_size': 20,
    'total': 38,
    'counts': {'all': 38, 'active': 1, 'past': 37, 'unfulfilled': 2},
    'rows': [
      {
        ...unfulfilled,
        'id': query.isEmpty ? unfulfilled['id'] : query,
        'status': status,
      },
    ],
  };
  @override
  Future<Map<String, dynamic>> riderHistory({
    int page = 1,
    String section = 'all',
    String query = '',
    String? categoryId,
    String? month,
  }) async {
    requests.add({
      'query': query,
      'category': categoryId,
      'month': month,
      'section': section,
    });
    return pending[query]?.future ?? result(query);
  }

  @override
  Future<List<Map<String, dynamic>>> vehicleCategories() async {
    catalogReads++;
    return [
      {'id': 'opaque-bike-id', 'name': 'Local Bike', 'is_selectable': true},
    ];
  }

  @override
  Future<Map<String, dynamic>> profile() async => {
    'first_name': 'Alex',
    'last_name': 'Morgan',
    'phone_e164': '+919999999999',
  };
  @override
  Future<Map<String, dynamic>> supportContacts() async => {
    'support_phone': '+919999999998',
    'support_email': 'help@example.test',
    'support_hours': '10 AM to 6 PM',
  };
}

class UnfulfilledTrip extends completed.CompletedTrip {
  UnfulfilledTrip() {
    status = 'NO_DRIVER_FOUND';
  }
  @override
  Future<Map<String, dynamic>> context(String id) async => {
    'ride_id': id,
    'status': status,
    'is_driver': false,
    'payment': null,
    'trip': {
      ...unfulfilled,
      'id': id,
      'quote': {
        'base_fare': '0',
        'distance_fare': '64',
        'time_fare': '0',
        'category_snapshot': {'name': 'Local Bike'},
      },
      'events': [
        {'event_type': 'RIDE_REQUESTED', 'created_at': '2026-10-31T05:30:00Z'},
        {'event_type': 'NO_DRIVER_FOUND', 'created_at': '2026-10-31T05:36:00Z'},
      ],
    },
  };
}

void main() {
  setUpAll(() async {
    dotenv.loadFromString(
      envString: 'API_BASE_URL=https://fixture.test/api/v2',
    );
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
    final font = File('.dart_tool/settings-preview-font.ttf');
    if (font.existsSync()) {
      await (FontLoader('Outfit')..addFont(
            Future.value(ByteData.sublistView(font.readAsBytesSync())),
          ))
          .load();
    }
  });

  test('quotes never become collections or cancellation obligations', () {
    final empty = RideFareSummary(unfulfilled);
    expect(empty.quote, 64);
    expect(empty.primaryAmount, 0);
    expect(empty.collectionLabel, 'No ride fare collected');
    final captured = RideFareSummary(
      unfulfilled,
      payment: {'status': 'CAPTURED', 'amount': '42', 'method': 'UPI'},
    );
    expect(captured.primaryAmount, 42);
    expect(captured.noRideCharge, isFalse);
    expect(captured.collectionLabel, 'Direct UPI received');
    expect(
      RideFareSummary(
        unfulfilled,
        payment: {
          'status': 'CAPTURED',
          'amount': '42',
          'provider_managed': true,
        },
      ).collectionLabel,
      'Payment received',
    );
    final provider = RideFareSummary(
      unfulfilled,
      payment: {'status': 'PENDING', 'provider_managed': true},
    );
    expect(provider.noRideCharge, isFalse);
    expect(provider.collectionLabel, isNot('No ride fare collected'));
    final refunded = RideFareSummary(
      unfulfilled,
      payment: {'status': 'REFUNDED'},
    );
    expect(refunded.primaryAmount, 0);
    expect(refunded.amountLabel, 'Net ride fare');
    final partial = RideFareSummary(
      {...unfulfilled, 'final_fare': '64'},
      payment: {'status': 'PARTIALLY_REFUNDED', 'amount': '42'},
    );
    expect(partial.amountLabel, 'Original ride fare');
    expect(partial.primaryAmount, 42);
    expect(partial.collectionLabel, contains('net amount not recorded'));
    final stopped = RideFareSummary({
      ...unfulfilled,
      'status': 'CANCELLED',
      'settlement_review': {'status': 'APPROVED', 'fee_amount': '6.4'},
    });
    expect(stopped.primaryAmount, 0);
    expect(rideReference(unfulfilled['id']), 'TRP-9007199254740993123');
    expect(RideFareSummary({'estimated_fare': 'NaN'}).primaryAmount, isNull);
  });

  testWidgets('history search debounces and discards outdated responses', (
    tester,
  ) async {
    final repo = MappingRepo();
    await tester.pumpWidget(glass.shell(RidesPage(repository: repo)));
    await tester.pumpAndSettle();
    expect(find.text('38 recorded ride requests'), findsOneWidget);
    expect(find.text('All (38)'), findsOneWidget);
    expect(repo.catalogReads, 0);
    repo.pending['old'] = Completer();
    await tester.enterText(
      find.byKey(const ValueKey('ride-history-search')),
      'old',
    );
    await tester.pump(const Duration(milliseconds: 399));
    expect(repo.requests.length, 1);
    expect(find.byType(RideHistoryCard), findsNothing);
    await tester.pump(const Duration(milliseconds: 2));
    expect(repo.requests.last['query'], 'old');
    await tester.enterText(
      find.byKey(const ValueKey('ride-history-search')),
      'University',
    );
    await tester.pump(const Duration(milliseconds: 401));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('ride-University')), findsOneWidget);
    repo.pending['old']!.complete(repo.result('old'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('ride-old')), findsNothing);
    expect(find.byKey(const ValueKey('ride-University')), findsOneWidget);
    expect(repo.catalogReads, 0);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('filters send month and exact category ID to the history API', (
    tester,
  ) async {
    final repo = MappingRepo();
    await tester.pumpWidget(glass.shell(RidesPage(repository: repo)));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Filter rides'));
    await tester.pumpAndSettle();
    expect(repo.catalogReads, 1);
    final dropdowns = find.byType(LiquidGlassDropdownFormField<String>);
    final category = tester.widget<LiquidGlassDropdownFormField<String>>(
      dropdowns.at(0),
    );
    category.onChanged!('opaque-bike-id');
    await tester.pumpAndSettle();
    tester
        .widget<LiquidGlassDropdownFormField<String>>(dropdowns.at(1))
        .onChanged!('10');
    await tester.pumpAndSettle();
    tester
        .widget<LiquidGlassDropdownFormField<String>>(dropdowns.at(2))
        .onChanged!('2026');
    await fixtures.press(tester, find.text('Apply filters'));
    expect(repo.requests.last['category'], 'opaque-bike-id');
    expect(repo.requests.last['month'], '2026-10');
    expect(find.text('October 2026'), findsOneWidget);
    expect(find.text('38 matching ride requests'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('completed receipt uses a verified trip context', (tester) async {
    await tester.pumpWidget(
      glass.shell(
        Navigator(
          onGenerateInitialRoutes: (_, _) => [
            MaterialPageRoute<void>(
              settings: const RouteSettings(
                arguments: RideDetailIntent('ride', receipt: true),
              ),
              builder: (_) => RideDetailPage(
                operationsRepository: completed.CompletedTrip(),
                mapBuilder: (_) => const Text('Stored route'),
              ),
            ),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Ride receipt'), findsOneWidget);
    await fixtures.press(tester, find.text('Done'));
    expect(find.text('Ride receipt'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  for (final action in ['View receipt', 'Book again']) {
    testWidgets('history $action preserves the opaque trip and coordinates', (
      tester,
    ) async {
      final repo = MappingRepo()..status = 'COMPLETED';
      Object? arguments;
      String? routeName;
      await tester.pumpWidget(
        MaterialApp(
          key: UniqueKey(),
          home: RidesPage(repository: repo),
          onGenerateRoute: (settings) {
            arguments = settings.arguments;
            routeName = settings.name;
            return MaterialPageRoute<void>(
              builder: (_) => const Scaffold(body: Text('Destination')),
            );
          },
        ),
      );
      await tester.pumpAndSettle();
      await fixtures.press(tester, find.text(action));
      if (action == 'View receipt') {
        expect(routeName, AppRoutes.rideDetail);
        expect((arguments as RideDetailIntent).id, unfulfilled['id']);
        expect((arguments as RideDetailIntent).receipt, isTrue);
      } else {
        expect(routeName, AppRoutes.home);
        expect(
          ((arguments as Map)['rebook'] as Map)['pickup_latitude'],
          '25.23',
        );
        expect(((arguments as Map)['rebook'] as Map)['id'], unfulfilled['id']);
      }
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets(
    'a failed receipt refresh retains the trip without presenting stale collection data',
    (tester) async {
      final repo = completed.CompletedTrip();
      await completed.detail(tester, repo);
      repo.fail = true;
      await fixtures.press(tester, find.text('View receipt'));
      expect(find.text('Ride receipt'), findsNothing);
      await tester.scrollUntilVisible(
        find.textContaining('Connection update failed:'),
        -250,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        find.textContaining('Showing the last confirmed update'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('history reference content fits a phone without losing actions', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(glass.shell(RidesPage(repository: MappingRepo())));
    await tester.pumpAndSettle();
    expect(find.text('TRP-9007199254740993123'), findsOneWidget);
    expect(find.text('5.0 km - Est. 12 min'), findsOneWidget);
    await glass.capture(tester, 'my-rides-reference-history');
    final action = find.text('Retry booking');
    await tester.scrollUntilVisible(
      action,
      250,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(action.hitTestable(), findsOneWidget);
    await glass.capture(tester, 'my-rides-reference-history-actions');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'unfulfilled detail shows quote, zero collection and real activity',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await completed.detail(tester, UnfulfilledTrip());
      await glass.capture(tester, 'my-rides-reference-unfulfilled');
      expect(find.text('No ride fare collected'), findsWidgets);
      expect(find.text('Search duration 6 min'), findsOneWidget);
      await fixtures.press(tester, find.text('Assigned driver'));
      expect(find.text('Not assigned'), findsNWidgets(2));
      expect(find.text('Your rating'), findsNothing);
      await fixtures.press(tester, find.text('Cost details'));
      await glass.capture(tester, 'my-rides-reference-cost');
      expect(find.text('Ride fare collected'), findsOneWidget);
      expect(
        find.text(
          'The quote is shown for reference. It is not a collected ride fare.',
        ),
        findsOneWidget,
      );
      await fixtures.press(tester, find.text('Trip activity'));
      await fixtures.press(
        tester,
        find.text('Trip activity'),
      ); // Re-open after the first tap.
      expect(find.text('No driver found'), findsOneWidget);
      expect(find.text('Ride requested'), findsOneWidget);
      expect(find.text('Authorization released'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('trip help shows configured contacts and static sharing', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      glass.shell(
        Scaffold(
          body: LiquidGlassScope(
            child: TripSafetySheet(
              trip: unfulfilled,
              repository: MappingRepo(),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('TRP-9007199254740993123'), findsOneWidget);
    expect(find.text('Alex Morgan - +919999999999'), findsOneWidget);
    expect(find.textContaining('not live tracking'), findsOneWidget);
    await fixtures.press(tester, find.text('Direct support channels'));
    await glass.capture(tester, 'my-rides-reference-help');
    expect(find.text('10 AM to 6 PM'), findsOneWidget);
    expect(find.text('+919999999998'), findsOneWidget);
    expect(find.textContaining('encrypted'), findsNothing);
    expect(find.text('24/7 support'), findsNothing);
    await tester.pumpWidget(
      glass.shell(
        Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: Scaffold(
              body: LiquidGlassScope(
                child: TripSafetySheet(
                  trip: unfulfilled,
                  repository: MappingRepo(),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Report a trip issue or dispute'),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(
      find.text('Report a trip issue or dispute').hitTestable(),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
