import 'package:user/features/rides/ride_detail_intent.dart';
import 'package:user/features/rides/widgets/ride_history_layout.dart';
import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/rides/pages/rides_page.dart';
import 'package:user/features/rides/pages/ride_detail_page.dart';
import 'package:user/features/rides/widgets/ride_glass.dart';
import 'package:user/features/rides/widgets/rider_trip_map.dart';
import 'package:user/features/user_app/user_app.repo.dart';
import '../partner_program/partner_glass_test.dart' as glass;
import '../partner_program/partner_submission_test.dart' as fixtures;
import 'phase_c_test.dart' as phase;

class GlassHistoryRepo extends UserAppRepository {
  final requests = <String>[];
  Completer<Map<String, dynamic>>? pending;
  Map<String, dynamic> result(String section, int page) => {
    'page': page,
    'page_size': 20,
    'total': 45,
    'rows': [
      {
        'id': '$section-$page',
        'status': section == 'active' ? 'SEARCHING' : 'COMPLETED',
        'created_at': '2026-10-31T07:00:00Z',
        'pickup_address': 'Bhagalpur Railway Station',
        'dropoff_address': 'Tilka Manjhi Bhagalpur University',
        'final_fare': '72',
        'payment': {'status': 'CAPTURED'},
        'quotes': [
          {
            'category_snapshot': {'name': 'City Bike'},
          },
        ],
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
    requests.add('$section:$page');
    return pending != null ? pending!.future : result(section, page);
  }
}

class CompletedTrip extends phase.TripRepo {
  CompletedTrip() {
    status = 'COMPLETED';
  }
  @override
  Future<Map<String, dynamic>> context(String id) async {
    final data = await super.context(id);
    return {
      ...data,
      'trip': {
        ...data['trip'] as Map,
        'created_at': '2026-10-31T07:00:00Z',
        'started_at': '2026-10-31T07:10:00Z',
        'completed_at': '2026-10-31T07:18:00Z',
        'actual_distance_m': '950',
        'actual_duration_s': 480,
        'final_fare': '72',
        'vehicle': {
          'make': 'Hero',
          'model': 'Splendor',
          'plate_number': 'BR10AA1234',
        },
        'driver': {
          'user_id': 'driver',
          'user': {'first_name': 'Ravi', 'last_name': 'Kumar'},
        },
        'review': {'score': 4, 'comment': 'Smooth trip'},
        'quote': {
          'base_fare': '0',
          'distance_fare': '72',
          'time_fare': '0',
          'category_snapshot': {
            'name': 'City Bike',
            'payment_policy': {'commission_percent': 0},
          },
        },
        'route': {
          'route_data': {
            'geometry': [
              [86.95, 25.23],
              [86.96, 25.24],
            ],
          },
        },
      },
    };
  }
}

Future<void> detail(
  WidgetTester tester,
  CompletedTrip repo, {
  double scale = 1,
}) async {
  await tester.pumpWidget(
    glass.shell(
      Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(scale)),
          child: Navigator(
            onGenerateInitialRoutes: (_, _) => [
              MaterialPageRoute<void>(
                settings: const RouteSettings(
                  name: AppRoutes.rideDetail,
                  arguments: RideDetailIntent('ride', history: true),
                ),
                builder: (_) => RideDetailPage(
                  operationsRepository: repo,
                  mapBuilder: (map) {
                    expect((map as RiderTripMap).driver, isNull);
                    return const ColoredBox(
                      color: Color(0xFFE4ECF8),
                      child: Center(child: Text('Stored route map')),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
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
      final face = FontLoader('Outfit')
        ..addFont(Future.value(ByteData.sublistView(font.readAsBytesSync())));
      await face.load();
    }
  });

  testWidgets('history groups past rides and appends when scrolled', (
    tester,
  ) async {
    final repo = GlassHistoryRepo()..pending = Completer();
    await tester.pumpWidget(glass.shell(RidesPage(repository: repo)));
    await tester.pump();
    expect(find.byType(RidesSkeleton), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    repo.pending!.complete(repo.result('all', 1));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('ride-all-1')), findsOneWidget);
    expect(find.text('Past rides'), findsOneWidget);
    expect(find.text('Pickup point'), findsOneWidget);
    repo.pending = Completer();
    expect(find.byTooltip('Refresh rides'), findsNothing);
    await tester.drag(find.byType(RefreshIndicator), const Offset(0, 340));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byKey(const ValueKey('ride-all-1')), findsOneWidget);
    repo.pending!.completeError(StateError('Offline'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('ride-all-1')), findsOneWidget);
    expect(find.text('Date / category'), findsNothing);
    expect(find.text('Next'), findsNothing);
    expect(find.text('Past'), findsNothing);
    expect(find.byKey(const ValueKey('ride-history-search')), findsNothing);
    repo.pending = Completer();
    await tester.tap(find.text('Try again'));
    await tester.pump();
    repo.pending!.complete(repo.result('all', 1));
    await tester.pumpAndSettle();
    repo.pending = Completer();
    await tester.drag(find.byType(ListView), const Offset(0, -340));
    await tester.pump();
    expect(find.byKey(const ValueKey('ride-all-1')), findsOneWidget);
    repo.pending!.complete(repo.result('all', 2));
    await tester.pumpAndSettle();
    expect(repo.requests, ['all:1', 'all:1', 'all:1', 'all:2']);
    expect(find.byKey(const ValueKey('ride-all-2')), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('history cards open the exact rider trip reference', (
    tester,
  ) async {
    await tester.pumpWidget(
      glass.shell(
        RidesPage(
          repository: GlassHistoryRepo(),
          operationsRepository: CompletedTrip(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(RideHistoryCard));
    await tester.pumpAndSettle();
    expect(find.byType(BottomSheet), findsOneWidget);
    expect(
      tester.widget<RideDetailPage>(find.byType(RideDetailPage)).historyRideId,
      'all-1',
    );
    expect(find.text('Ravi Kumar'), findsOneWidget);
    expect(find.byTooltip('Close ride details'), findsNothing);
    expect(find.text('Completed'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.byType(BottomSheet), findsNothing);
    expect(tester.takeException(), isNull);
  });

  for (final scale in [1.0, 2.0]) {
    testWidgets(
      'completed trip uses real route/facts/costs and stays scrollable at scale $scale',
      (tester) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await detail(tester, CompletedTrip(), scale: scale);
        expect(find.text('Stored route map'), findsNothing);
        expect(find.text('Pickup point'), findsOneWidget);
        await fixtures.press(tester, find.text('BR10AA1234'));
        expect(find.text('Ravi Kumar'), findsOneWidget);
        await fixtures.press(tester, find.text('Smooth trip'));
        expect(find.byIcon(Icons.star), findsNWidgets(4));
        expect(find.text('8 min'), findsOneWidget);
        await tester.tap(find.byTooltip('Show route map'));
        await tester.pumpAndSettle();
        expect(find.text('Ride map'), findsOneWidget);
        await tester.scrollUntilVisible(
          find.text('Stored route map'),
          100,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.text('Stored route map'), findsOneWidget);
        await tester.tap(find.byTooltip('Show trip summary'));
        await tester.pumpAndSettle();
        expect(find.text('Ride details'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets(
    'history and detail skeleton adapt to a small landscape screen with large text',
    (tester) async {
      tester.view.physicalSize = const Size(568, 320);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final repo = GlassHistoryRepo();
      await tester.pumpWidget(
        glass.shell(
          Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: const TextScaler.linear(2)),
              child: RidesPage(repository: repo),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView), const Offset(0, -340));
      await tester.pumpAndSettle();
      expect(repo.requests.last, 'all:2');
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(
        glass.shell(
          const LiquidGlassPage(
            title: 'Trip details',
            child: RidesSkeleton(detail: true),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
