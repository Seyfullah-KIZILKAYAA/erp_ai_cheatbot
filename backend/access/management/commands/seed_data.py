from django.core.management.base import BaseCommand
from django.contrib.auth.models import User

class Command(BaseCommand):
    help = 'Seeds initial superuser'

    def handle(self, *args, **options):
        username = 'seyfullah'
        password = 'admin123'
        
        if not User.objects.filter(username=username).exists():
            User.objects.create_superuser(username=username, password=password, email='admin@example.com')
            self.stdout.write(self.style.SUCCESS(f'Superuser {username} created'))
        else:
            self.stdout.write(self.style.WARNING(f'User {username} already exists'))

        self.stdout.write(self.style.SUCCESS('Successfully seeded data'))
