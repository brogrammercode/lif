import 'dart:convert';
import 'dart:typed_data';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/features/driver_account/driver_account.repo.dart';
import 'package:user/features/driver_account/pages/driver_account_page.dart';
import 'package:user/features/driver_account/pages/driver_finances_page.dart';
import 'package:user/features/driver_account/pages/driver_documents_page.dart';
import 'package:user/features/driver_account/widgets/payout_change_form.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';

class AccountRepo extends DriverAccountRepository {
  bool exited = false, fail = false;
  int submissions = 0;
  final keys = <String>[], bodies = <Map<String, dynamic>>[];
  @override
  Future<Map<String, dynamic>> account() async => {
    'driver': {
      'id': 'driver',
      'availability': 'SUSPENDED',
      'verification_status': 'VERIFIED',
    },
    'application': {
      'status': exited ? 'EXITED' : 'ACTIVATED',
      'fields': <Map<String, dynamic>>[],
    },
    'exited': exited,
    'payout_changes': <Map<String, dynamic>>[],
  };
  @override
  Future<void> requestPayout(String key, Map<String, dynamic> details) async {
    keys.add(key);
    bodies.add(details);
    submissions++;
    throw StateError('Connection lost');
  }

  @override
  Future<Map<String, dynamic>> requests({int page = 1}) async => {
    'brands': <Map<String, dynamic>>[],
    'models': <Map<String, dynamic>>[],
    'brand_count': 0,
    'model_count': 0,
  };
  @override
  Future<Map<String, dynamic>> finances({
    String? from,
    String? to,
    int page = 1,
    String section = 'trips',
  }) async {
    if (fail) throw StateError('Offline');
    return {
      'summary': {
        'gross_fares': '100',
        'cash_received': '40',
        'upi_received': '10',
        'collection_pending': '50',
        'receipt_unrecorded': '0',
        'other_received': '0',
        'waived': '0',
        'provider_resolved': '0',
        'approved_charges_due': '10',
        'charges_received': '0',
        'charges_under_review': '5',
        'commission': '0',
        'platform_payout': '0',
      },
      'rows': <Map<String, dynamic>>[],
      'total': 0,
      'page': page,
      'page_size': 20,
      'from': '2026-10-01',
      'to': '2026-10-24',
      'as_of': DateTime.now().toIso8601String(),
    };
  }
}

class DocumentRepo extends VehicleVerificationRepository {
  int uploads = 0, renewals = 0;
  Completer<Map<String, dynamic>>? pending;
  @override
  Future<Map<String, dynamic>> documents() async => {
    'vehicles': [
      {
        'id': 'vehicle',
        'make': 'Brand',
        'model': 'Bike',
        'plate_number': 'BR01A1234',
        'status': 'ACTIVE',
        'verification_version': 4,
        'verification_fields': [
          {
            'key': 'insurance',
            'label': 'Insurance',
            'status': 'APPROVED',
            'value': 'old',
          },
        ],
        'verification_assets': [
          {'id': 'old', 'file_name': 'old.pdf'},
        ],
      },
    ],
  };
  @override
  Future<Map<String, dynamic>> upload(
    String key,
    String name,
    Uint8List bytes,
  ) async {
    uploads++;
    return pending == null ? {'id': 'new'} : pending!.future;
  }

  @override
  Future<void> renewDocument(
    String id,
    int version,
    String key,
    String assetId,
  ) async {
    renewals++;
  }
}

Future<void> replacementPreview(WidgetTester tester, DocumentRepo repo) async {
  await tester.pumpWidget(
    app(
      DriverDocumentsPage(
        repository: repo,
        selectDocument: (_) async => VehicleDocumentSelection(
          'insurance.pdf',
          Uint8List.fromList(utf8.encode('%PDF-1.7\n%%EOF')),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('Replace for review'));
  await tester.tap(find.text('Replace for review'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Choose replacement'));
  await tester.pump(const Duration(milliseconds: 400));
  expect(find.text('Review replacement'), findsOneWidget);
}

Widget app(Widget child) => ScreenUtilInit(
  designSize: const Size(390, 844),
  builder: (_, _) => MaterialApp(home: child),
);
void main() {
  setUpAll(
    () => dotenv.loadFromString(
      envString: 'API_BASE_URL=https://example.test/api/v2',
    ),
  );
  testWidgets(
    'cancelling the replacement preview never uploads a private file',
    (tester) async {
      final repo = DocumentRepo();
      await replacementPreview(tester, repo);
      expect(repo.uploads, 0);
      final preview = find.ancestor(
        of: find.text('Review replacement'),
        matching: find.byType(AlertDialog),
      );
      await tester.tap(
        find.descendant(of: preview, matching: find.text('Cancel')),
      );
      await tester.pumpAndSettle();
      expect(repo.uploads, 0);
      expect(repo.renewals, 0);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets('document replacement uploads only after explicit submission', (
    tester,
  ) async {
    final repo = DocumentRepo();
    await replacementPreview(tester, repo);
    expect(repo.uploads, 0);
    await tester.tap(find.text('Submit replacement'));
    await tester.pumpAndSettle();
    expect(repo.uploads, 1);
    expect(repo.renewals, 1);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
    'leaving during upload cannot submit a vehicle renewal afterwards',
    (tester) async {
      final repo = DocumentRepo()..pending = Completer<Map<String, dynamic>>();
      await replacementPreview(tester, repo);
      await tester.tap(find.text('Submit replacement'));
      await tester.pump(const Duration(milliseconds: 400));
      expect(repo.uploads, 1);
      await tester.pumpWidget(const SizedBox.shrink());
      repo.pending!.complete({'id': 'new'});
      await tester.pump();
      expect(repo.renewals, 0);
      expect(tester.takeException(), isNull);
    },
  );
  test(
    'vehicle PDF payload preserves bytes and cannot replace front/back images',
    () {
      final bytes = Uint8List.fromList(utf8.encode('%PDF-1.7\n%%EOF'));
      final payload = VehicleVerificationRepository.documentPayload(
        'insurance',
        'policy.pdf',
        bytes,
      );
      expect(
        payload['data_url'],
        'data:application/pdf;base64,${base64Encode(bytes)}',
      );
      expect(
        () => VehicleVerificationRepository.documentPayload(
          'front_image',
          'policy.pdf',
          bytes,
        ),
        throwsStateError,
      );
    },
  );
  testWidgets(
    'payout form validates UPI and freezes retries with the same key',
    (tester) async {
      final repo = AccountRepo();
      await tester.pumpWidget(
        app(Scaffold(body: PayoutChangeForm(repository: repo))),
      );
      await tester.enterText(find.byType(TextFormField).at(0), 'Test Driver');
      await tester.enterText(find.byType(TextFormField).at(1), 'not-upi');
      await tester.ensureVisible(find.text('Submit for review'));
      await tester.tap(find.text('Submit for review'));
      await tester.pump();
      expect(repo.submissions, 0);
      expect(find.text('Enter a valid UPI ID'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField).at(1), 'driver@upi');
      await tester.ensureVisible(find.text('Submit for review'));
      await tester.tap(find.text('Submit for review'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Retry same request'));
      await tester.tap(find.text('Retry same request'));
      await tester.pumpAndSettle();
      expect(repo.submissions, 2);
      expect(repo.keys[0], repo.keys[1]);
      expect(repo.bodies[0], repo.bodies[1]);
      expect(
        tester.widget<TextFormField>(find.byType(TextFormField).first).enabled,
        isFalse,
      );
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'exited drivers retain account reads but cannot request a destination change',
    (tester) async {
      final repo = AccountRepo()..exited = true;
      await tester.pumpWidget(app(DriverAccountPage(repository: repo)));
      await tester.pumpAndSettle();
      expect(find.textContaining('Exit complete'), findsOneWidget);
      await tester.tap(find.text('Payout details'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Request account change'),
            )
            .onPressed,
        isNull,
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'finance failure retains the checked statement without inventing received earnings',
    (tester) async {
      final repo = AccountRepo();
      await tester.pumpWidget(app(DriverFinancesPage(repository: repo)));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('no withdrawable platform balance'),
        findsOneWidget,
      );
      repo.fail = true;
      await tester.tap(find.byTooltip('Refresh statement'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Offline'), findsOneWidget);
      expect(find.byType(AppCard), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
