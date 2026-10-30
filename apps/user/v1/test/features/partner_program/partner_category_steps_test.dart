import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/partner_program/pages/partner_program_page.dart';
import 'package:user/features/partner_program/partner_application_step.dart';
import 'package:user/features/partner_program/partner_draft_store.dart';
import 'package:user/features/partner_program/widgets/partner_upload_tile.dart';
import 'package:user/features/partner_program/widgets/partner_application_skeleton.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'partner_submission_test.dart' as fixtures;
import 'partner_glass_test.dart' as glass;

class CategoryWorkflow extends fixtures.SubmissionRepo {
  bool corrections = false;
  List<Map<String, dynamic>> get definitions => [
    {
      'id': 'name',
      'label': 'Full name',
      'field_type': 'STRING',
      'is_required': true,
      'category': {'id': '9007199254740993', 'name': 'Personal details'},
    },
    {
      'id': 'licence',
      'label': 'Driving licence',
      'field_type': 'PDF',
      'is_required': true,
      'category': {'id': 'documents', 'name': 'Documents'},
    },
    {
      'id': 'photo',
      'label': 'Profile photo',
      'field_type': 'IMAGE',
      'is_required': false,
      'category': {'id': 'documents', 'name': 'Documents'},
    },
    {
      'id': '__live_selfie__',
      'label': 'Live selfie',
      'field_type': 'IMAGE',
      'is_required': true,
      'capture_mode': 'CAMERA',
      'category': {'id': 'identity', 'name': 'Identity verification'},
    },
  ];

  @override
  Future<Map<String, dynamic>> workflow() async {
    final data = await super.workflow();
    return {
      ...data,
      'requirements': definitions,
      if (corrections && submitted == null)
        'application': {
          'id': 'application',
          'status': 'CHANGES_REQUESTED',
          'version': 4,
          'contact_email': 'rider@example.test',
          'whatsapp_phone': '+919999999999',
          'fields': [
            {
              'requirement_id': 'name',
              'value': 'Reviewed Name',
              'status': 'APPROVED',
            },
            {
              'requirement_id': 'licence',
              'value': [],
              'status': 'REJECTED',
              'rejection_reason': 'Please upload a clear copy.',
            },
            {'requirement_id': 'photo', 'value': [], 'status': 'APPROVED'},
            {
              'requirement_id': '__live_selfie__',
              'value': ['selfie-asset'],
              'status': 'APPROVED',
            },
          ],
        },
      if (corrections)
        'assets': [
          {'id': 'selfie-asset', 'file_name': 'live_selfie.jpg'},
        ],
    };
  }
}

Widget wizard(
  CategoryWorkflow repo,
  fixtures.MemoryDraft store, {
  double scale = 1,
}) => glass.shell(
  Builder(
    builder: (context) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(scale)),
      child: PartnerProgramPage(
        repository: repo,
        currentUser: () async => const UserModel(
          id: 'fixture',
          role: 'RIDER',
          status: 'ACTIVE',
          email: 'rider@example.test',
          phoneE164: '+919999999999',
        ),
        createDraftStore: (_) async => store,
        selectFiles: (field) async => [
          PartnerLocalFile(
            name: '${field['id']}.pdf',
            path: '/fixture/${field['id']}.pdf',
          ),
        ],
        captureSelfie: () async =>
            XFile.fromData(Uint8List.fromList([1, 2, 3]), name: 'selfie.jpg'),
      ),
    ),
  ),
);

Future<void> begin(
  WidgetTester tester,
  CategoryWorkflow repo,
  fixtures.MemoryDraft store, {
  double scale = 1,
}) async {
  await tester.pumpWidget(wizard(repo, store, scale: scale));
  await tester.pumpAndSettle();
  await fixtures.press(tester, find.byType(Checkbox));
  await fixtures.press(tester, find.text('Continue to application'));
}

Future<void> choose(WidgetTester tester, String id) => fixtures.press(
  tester,
  find.descendant(
    of: find.byKey(ValueKey('partner-upload-$id')),
    matching: find.text('Choose files'),
  ),
);

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

  test(
    'category IDs stay opaque and duplicate names do not merge identities',
    () {
      final fields = [
        {
          'id': 'a',
          'category': {'id': '9007199254740993', 'name': 'Details'},
        },
        {
          'id': 'b',
          'category': {'id': '9007199254740992', 'name': 'Details'},
        },
        {
          'id': 'c',
          'category': {'id': '9007199254740993', 'name': 'Details'},
        },
        {'id': 'd'},
        {
          'id': 'e',
          'category': {'name': 'Legacy'},
        },
      ];
      final steps = PartnerApplicationStep.fromRequirements(fields);
      expect(steps.map((step) => step.key), [
        'contact',
        'category:9007199254740993',
        'category:9007199254740992',
        'uncategorized',
        'name:Legacy',
      ]);
      expect(steps[1].fields.map((field) => field['id']), ['a', 'c']);
      expect(PartnerApplicationStep.fromRequirements([]), hasLength(1));
    },
  );

  testWidgets(
    'validates each category, preserves back navigation and uploads only on final Submit',
    (tester) async {
      final repo = CategoryWorkflow(), store = fixtures.MemoryDraft();
      await begin(tester, repo, store);
      expect(find.text('Step 1 of 4'), findsOneWidget);
      expect(find.text('Submit application'), findsNothing);
      await tester.enterText(
        find.byKey(const ValueKey('partner-contact-email')),
        'invalid',
      );
      await fixtures.press(tester, find.text('Continue'));
      expect(find.text('Step 1 of 4'), findsOneWidget);
      await tester.enterText(
        find.byKey(const ValueKey('partner-contact-email')),
        'rider@example.test',
      );
      await fixtures.press(tester, find.text('Continue'));
      await fixtures.press(tester, find.text('Continue'));
      expect(find.text('Full name is required.'), findsOneWidget);
      expect(repo.uploads, isEmpty);
      await tester.enterText(find.byType(TextFormField), 'Alex Morgan');
      await fixtures.press(tester, find.text('Continue'));
      expect(find.text('Step 3 of 4'), findsOneWidget);
      final licence = tester.getRect(
        find.byKey(const ValueKey('partner-upload-licence')),
      );
      final photo = tester.getRect(
        find.byKey(const ValueKey('partner-upload-photo')),
      );
      expect(photo.left, licence.left);
      expect(photo.width, licence.width);
      expect(photo.top - licence.bottom, greaterThanOrEqualTo(20));
      await choose(tester, 'licence');
      expect(repo.uploads, isEmpty);
      await fixtures.press(tester, find.text('Review files (1)'));
      expect(find.text('licence.pdf'), findsWidgets);
      await fixtures.press(tester, find.text('Done'));
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<TextFormField>(find.byType(TextFormField))
            .controller!
            .text,
        'Alex Morgan',
      );
      await fixtures.press(tester, find.text('Continue'));
      await fixtures.press(tester, find.text('Continue'));
      expect(find.text('Step 4 of 4'), findsOneWidget);
      await fixtures.press(tester, find.text('Submit application'));
      expect(find.text('Live selfie is required.'), findsOneWidget);
      expect(repo.submissions, 0);
      await fixtures.press(tester, find.text('Take live selfie'));
      expect(repo.uploads, isEmpty);
      await fixtures.press(tester, find.text('Submit application'));
      expect(repo.submitted?['contact_email'], 'rider@example.test');
      expect(repo.uploads, [
        'licence:licence.pdf',
        '__live_selfie__:live_selfie.jpg',
      ]);
      expect(repo.maxActive, 1);
      expect(repo.submissions, 1);
      expect(find.text('submitted'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'restores saved category and redirects final validation to a missing offscreen answer',
    (tester) async {
      final repo = CategoryWorkflow(), store = fixtures.MemoryDraft();
      await begin(tester, repo, store);
      await fixtures.press(tester, find.text('Continue'));
      await tester.enterText(find.byType(TextFormField), 'Alex Morgan');
      await fixtures.press(tester, find.text('Continue'));
      await choose(tester, 'licence');
      await fixtures.press(tester, find.text('Continue'));
      await fixtures.press(tester, find.text('Take live selfie'));
      await tester.pump(const Duration(milliseconds: 450));
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      expect(store.value?['form_step'], 'category:identity');
      (store.value!['text'] as Map)['name'] = '';
      await tester.pumpWidget(wizard(repo, store));
      await tester.pumpAndSettle();
      expect(find.text('Step 4 of 4'), findsOneWidget);
      await fixtures.press(tester, find.text('Submit application'));
      expect(find.text('Step 2 of 4'), findsOneWidget);
      expect(find.text('Full name is required.'), findsOneWidget);
      expect(repo.uploads, isEmpty);
      expect(repo.submissions, 0);
      await tester.enterText(find.byType(TextFormField), 'Corrected Name');
      await fixtures.press(tester, find.text('Continue'));
      await fixtures.press(tester, find.text('Continue'));
      await fixtures.press(tester, find.text('Submit application'));
      expect(repo.submissions, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'corrections open rejected category and keep approved answers locked',
    (tester) async {
      final repo = CategoryWorkflow()..corrections = true;
      await tester.pumpWidget(wizard(repo, fixtures.MemoryDraft()));
      await tester.pumpAndSettle();
      expect(find.text('Step 3 of 4'), findsOneWidget);
      expect(
        find.text('Correction required: Please upload a clear copy.'),
        findsOneWidget,
      );
      expect(
        tester
            .widget<PartnerUploadTile>(
              find.byKey(const ValueKey('partner-upload-photo')),
            )
            .onChoose,
        isNull,
      );
      await choose(tester, 'licence');
      await fixtures.press(tester, find.byTooltip('Previous category'));
      expect(
        tester.widget<TextFormField>(find.byType(TextFormField)).enabled,
        isFalse,
      );
      await fixtures.press(tester, find.text('Continue'));
      await fixtures.press(tester, find.text('Continue'));
      expect(
        tester
            .widget<PartnerUploadTile>(
              find.byKey(const ValueKey('partner-upload-__live_selfie__')),
            )
            .onChoose,
        isNull,
      );
      await fixtures.press(tester, find.text('Submit corrections'));
      expect(repo.submitted?['version'], 4);
      expect(
        (repo.submitted!['answers'] as List).first['value'],
        'Reviewed Name',
      );
      expect(repo.uploads, ['licence:licence.pdf']);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  for (final scale in [1.0, 2.0]) {
    testWidgets(
      'compact form and upload sheet fit a narrow screen at text scale $scale',
      (tester) async {
        tester.view.physicalSize = const Size(320, 640);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final repo = CategoryWorkflow(), store = fixtures.MemoryDraft();
        await begin(tester, repo, store, scale: scale);
        await fixtures.press(tester, find.text('Continue'));
        await tester.enterText(find.byType(TextFormField), 'Alex Morgan');
        await tester.pumpAndSettle();
        await glass.capture(tester, 'partner-category-details-$scale');
        await fixtures.press(tester, find.text('Continue'));
        await tester.pumpAndSettle();
        await glass.capture(tester, 'partner-category-uploads-$scale');
        await choose(tester, 'licence');
        await fixtures.press(tester, find.text('Review files (1)'));
        expect(tester.takeException(), isNull);
        await tester.tap(find.byTooltip('Remove file'));
        await tester.pumpAndSettle();
        expect(find.text('No files selected.'), findsOneWidget);
        await fixtures.press(tester, find.text('Done'));
        expect(find.text('Review files (1)'), findsNothing);
        await fixtures.press(tester, find.text('Continue'));
        expect(find.text('Driving licence is required.'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets(
    'category skeleton matches fields and upload cards at large text size',
    (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        glass.shell(
          Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: const TextScaler.linear(2)),
              child: const LiquidGlassPage(
                title: 'Partner Program',
                child: PartnerApplicationSkeleton(fields: 2, uploads: 3),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.bySemanticsLabel('Loading application category'),
        findsOneWidget,
      );
      expect(find.byType(CircularProgressIndicator), findsNothing);
      await tester.drag(
        find.byType(SingleChildScrollView),
        const Offset(0, -500),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
