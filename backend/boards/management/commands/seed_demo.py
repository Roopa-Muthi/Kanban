"""Create the public demo account and its sample boards.

Safe to run more than once:
  python manage.py seed_demo           creates whatever is missing and resets the demo password;
                                       existing demo boards (and any edits to them) are left alone
  python manage.py seed_demo --reset   deletes the demo account's boards and recreates them

Only the demo account's own boards are ever touched.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from boards.models import Board, Card, Column

DEMO_USERNAME = "demo"
DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "kanban-demo-2026"  # public on purpose: it goes in the README
GAP = 1000

# Card keys: title, description, due (days from today; negative means overdue),
# mine (assign it to the demo user).
BOARDS = [
    {
        "name": "Product launch",
        "columns": [
            (
                "Backlog",
                [
                    {
                        "title": "Plan the launch announcement",
                        "description": "Draft the blog post and the email to existing users.\n"
                        "Decide who reviews it before it goes out.",
                        "due": 14,
                    },
                    {"title": "Collect three customer quotes"},
                    {
                        "title": "Translate the landing page",
                        "description": "Spanish and Hindi first.",
                        "due": 21,
                    },
                ],
            ),
            (
                "In progress",
                [
                    {
                        "title": "Build the pricing page",
                        "description": "Three tiers.\nMonthly and yearly toggle.",
                        "due": 3,
                        "mine": True,
                    },
                    {"title": "Fix the signup form on mobile", "due": -2, "mine": True},
                    {
                        "title": "Set up error monitoring",
                        "description": "Alerts go to the team channel.",
                        "due": 5,
                    },
                ],
            ),
            (
                "Review",
                [
                    {
                        "title": "Write the onboarding emails",
                        "description": "A welcome email plus two follow-ups.",
                        "mine": True,
                    },
                    {
                        "title": "Check dashboard accessibility",
                        "description": "Keyboard navigation and colour contrast.",
                        "due": 1,
                    },
                ],
            ),
            (
                "Done",
                [
                    {"title": "Choose a domain name"},
                    {"title": "Create the brand assets", "description": "Logo, colours and a favicon."},
                    {"title": "Set up the staging environment"},
                ],
            ),
        ],
    },
    {
        "name": "Weekend project",
        "columns": [
            ("To do", [{"title": "Sketch the layout"}, {"title": "Pick a colour palette", "due": 2}]),
            (
                "Doing",
                [
                    {
                        "title": "Build the first prototype",
                        "description": "Start with the main screen only.",
                        "mine": True,
                    }
                ],
            ),
            ("Done", []),  # empty on purpose: shows the empty-column state
        ],
    },
]


class Command(BaseCommand):
    help = "Create the demo account and its sample boards. Safe to run more than once."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete the demo account's boards first, then recreate them.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        user, created = User.objects.get_or_create(
            username=DEMO_USERNAME, defaults={"email": DEMO_EMAIL}
        )
        user.set_password(DEMO_PASSWORD)  # every run, so the documented login always works
        user.save()
        self.stdout.write(f"Demo account {'created' if created else 'already exists'}: {DEMO_USERNAME}")

        if options["reset"]:
            removed, _ = Board.objects.filter(owner=user).delete()
            self.stdout.write(f"Removed {removed} existing demo objects (boards, columns and cards).")

        existing = set(Board.objects.filter(owner=user).values_list("name", flat=True))
        # Boards are listed newest first, so create them in reverse: the first one in BOARDS ends up on top.
        for spec in reversed(BOARDS):
            if spec["name"] in existing:
                self.stdout.write(f'Board "{spec["name"]}" already exists, leaving it alone.')
                continue
            self._create_board(user, spec)
            self.stdout.write(self.style.SUCCESS(f'Created board "{spec["name"]}".'))

        self.stdout.write(f"Login: {DEMO_USERNAME} / {DEMO_PASSWORD}")

    def _create_board(self, user, spec):
        today = timezone.localdate()
        board = Board.objects.create(name=spec["name"], owner=user)
        for c_index, (column_title, cards) in enumerate(spec["columns"], start=1):
            column = Column.objects.create(board=board, title=column_title, position=c_index * GAP)
            for k_index, card in enumerate(cards, start=1):
                due = card.get("due")
                Card.objects.create(
                    column=column,
                    title=card["title"],
                    description=card.get("description", ""),
                    position=k_index * GAP,
                    created_by=user,
                    assignee=user if card.get("mine") else None,
                    due_date=today + timedelta(days=due) if due is not None else None,
                )