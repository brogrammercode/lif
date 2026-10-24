import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
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
        return const LinearProgressIndicator(color: AppColors.primaryGreen);
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
            const Text(
              'Contact support',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
            ),
            if (data['support_hours'] != null) Text('${data['support_hours']}'),
            if (data['instructions'] != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text('${data['instructions']}'),
              ),
            if (phone == null &&
                emergency == null &&
                whatsapp == null &&
                email == null)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'You can contact the team by creating a support request below.',
                ),
              ),
            if (phone != null)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.phone_outlined),
                title: const Text('Call support'),
                subtitle: Text(phone),
                onTap: () => _open(Uri(scheme: 'tel', path: phone)),
              ),
            if (emergency != null)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.health_and_safety_outlined),
                title: const Text('Urgent help'),
                subtitle: Text(emergency),
                onTap: () => _open(Uri(scheme: 'tel', path: emergency)),
              ),
            if (whatsapp != null)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.chat_bubble_outline),
                title: const Text('WhatsApp support'),
                subtitle: Text(whatsapp),
                onTap: () => _open(
                  Uri.https(
                    'wa.me',
                    '/${whatsapp.replaceAll(RegExp(r'\D'), '')}',
                  ),
                ),
              ),
            if (email != null)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.email_outlined),
                title: const Text('Email support'),
                subtitle: Text(email),
                onTap: () => _open(Uri(scheme: 'mailto', path: email)),
              ),
          ],
        ),
      );
    },
  );
}
