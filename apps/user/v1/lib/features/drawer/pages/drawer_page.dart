import 'package:flutter/material.dart';
import 'package:user/features/home/constants/home.constant.dart';

class DrawerPage extends StatelessWidget {
  const DrawerPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Drawer(
      backgroundColor: Colors.white,
      child: SafeArea(
        child: Column(
          children: [
            // Profile Card on top
            Container(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  ClipOval(
                    child: Image.network(
                      HomeConstants.PROFILE_IMAGE_URL,
                      width: 60,
                      height: 60,
                      fit: BoxFit.cover,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        "Harsh Bhumihar",
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(
                            Icons.star,
                            color: Colors.greenAccent.shade400,
                            size: 16,
                          ),
                          const SizedBox(width: 4),
                          const Text(
                            "5.0",
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            // My Rides
            ListTile(
              leading: const Icon(Icons.history, color: Colors.black87),
              title: const Text(
                "My Rides",
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              onTap: () {},
            ),
            const Divider(height: 1),
            // More Section
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              alignment: Alignment.centerLeft,
              child: const Text(
                "MORE",
                style: TextStyle(
                  color: Colors.grey,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1.2,
                ),
              ),
            ),
            ListTile(
              leading: const Icon(
                Icons.feedback_outlined,
                color: Colors.black87,
              ),
              title: const Text(
                "Your Feedback",
                style: TextStyle(fontWeight: FontWeight.w500),
              ),
              onTap: () {},
            ),
            ListTile(
              leading: const Icon(Icons.info_outline, color: Colors.black87),
              title: const Text(
                "About",
                style: TextStyle(fontWeight: FontWeight.w500),
              ),
              onTap: () {},
            ),
            ListTile(
              leading: const Icon(
                Icons.rate_review_outlined,
                color: Colors.black87,
              ),
              title: const Text(
                "Send Feedback",
                style: TextStyle(fontWeight: FontWeight.w500),
              ),
              onTap: () {},
            ),
            ListTile(
              leading: const Icon(
                Icons.warning_amber_rounded,
                color: Colors.red,
              ),
              title: const Text(
                "Report a safety Emergency",
                style: TextStyle(
                  fontWeight: FontWeight.w500,
                  color: Colors.red,
                ),
              ),
              onTap: () {},
            ),
            ListTile(
              leading: const Icon(
                Icons.settings_outlined,
                color: Colors.black87,
              ),
              title: const Text(
                "Settings",
                style: TextStyle(fontWeight: FontWeight.w500),
              ),
              onTap: () {},
            ),
            const Spacer(),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.logout, color: Colors.black87),
              title: const Text(
                "Log out",
                style: TextStyle(fontWeight: FontWeight.w500),
              ),
              onTap: () {},
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}
