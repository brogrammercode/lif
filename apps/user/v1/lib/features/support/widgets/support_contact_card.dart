import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class SupportContactCard extends StatefulWidget {
  final UserAppRepository? repository;
  const SupportContactCard({super.key, this.repository});
  @override
  State<SupportContactCard> createState() => _SupportContactCardState();
}

class _SupportContactCardState extends State<SupportContactCard> {
  late Future<Map<String, dynamic>> _data =
      (widget.repository ?? UserAppRepository()).supportContacts();
  Future<void> _open(Uri uri) async {
    try {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return;
    } catch (_) {}
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('This contact action could not be opened.'),
        ),
      );
    }
  }

  Widget _contact(
    IconData icon,
    String title,
    String value,
    Uri uri, {
    bool urgent = false,
  }) => Padding(
    padding: const EdgeInsets.only(top: 12),
    child: InkWell(
      onTap: () => _open(uri),
      borderRadius: BorderRadius.circular(16),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 64),
        child: Row(
          children: [
            SizedBox(
              width: 40,
              height: 40,
              child: LiquidGlassSurface(
                radius: 99,
                padding: EdgeInsets.zero,
                child: Icon(
                  icon,
                  size: 20,
                  color: urgent ? AppColors.googleRed : GlassTokens.accent,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: urgent ? AppColors.googleRed : GlassTokens.ink,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    value,
                    style: const TextStyle(
                      fontSize: 12,
                      height: 1.4,
                      color: GlassTokens.muted,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            const Icon(Icons.chevron_right, size: 19, color: GlassTokens.muted),
          ],
        ),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: _data,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Support contacts are temporarily unavailable.'),
              TextButton(
                onPressed: () => setState(() {
                  _data = (widget.repository ?? UserAppRepository())
                      .supportContacts();
                }),
                child: const Text('Retry contacts'),
              ),
            ],
          ),
        );
      }
      if (!snapshot.hasData) {
        return const AppCard(
          child: AppSkeleton(
            label: 'Loading support contacts',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SkeletonBox(width: 150, height: 18),
                SizedBox(height: 20),
                SkeletonBox(height: 48),
                SizedBox(height: 16),
                SkeletonBox(height: 48),
              ],
            ),
          ),
        );
      }
      final data = snapshot.data!;
      final phone = data['support_phone'] as String?;
      final emergency = data['emergency_phone'] as String?;
      final whatsapp = data['whatsapp_phone'] as String?;
      final email = data['support_email'] as String?;
      return AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(
                  Icons.contact_support_outlined,
                  size: 21,
                  color: GlassTokens.accent,
                ),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Direct support channels',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: GlassTokens.ink,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 5),
            const Text(
              'Use a configured channel, or keep a trackable conversation in a support request.',
              style: TextStyle(
                fontSize: 12,
                height: 1.4,
                color: GlassTokens.muted,
              ),
            ),
            if (data['support_hours'] != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Row(
                  children: [
                    const Icon(
                      Icons.schedule_outlined,
                      size: 16,
                      color: GlassTokens.muted,
                    ),
                    const SizedBox(width: 7),
                    Expanded(
                      child: Text(
                        '${data['support_hours']}',
                        style: const TextStyle(
                          color: GlassTokens.muted,
                          fontSize: 12,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            if (data['instructions'] != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  '${data['instructions']}',
                  style: const TextStyle(
                    color: GlassTokens.muted,
                    fontSize: 12,
                    height: 1.4,
                  ),
                ),
              ),
            if (phone == null &&
                emergency == null &&
                whatsapp == null &&
                email == null)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'You can contact the team by creating a support request below.',
                  style: TextStyle(
                    color: GlassTokens.muted,
                    fontSize: 12,
                    height: 1.4,
                  ),
                ),
              ),
            if (phone != null)
              _contact(
                Icons.phone_outlined,
                'Call support',
                phone,
                Uri(scheme: 'tel', path: phone),
              ),
            if (emergency != null)
              _contact(
                Icons.health_and_safety_outlined,
                'Urgent safety help',
                emergency,
                Uri(scheme: 'tel', path: emergency),
                urgent: true,
              ),
            if (whatsapp != null)
              _contact(
                Icons.chat_bubble_outline,
                'WhatsApp support',
                whatsapp,
                Uri.https(
                  'wa.me',
                  '/${whatsapp.replaceAll(RegExp(r'\D'), '')}',
                ),
              ),
            if (email != null)
              _contact(
                Icons.email_outlined,
                'Email support',
                email,
                Uri(scheme: 'mailto', path: email),
              ),
          ],
        ),
      );
    },
  );
}
