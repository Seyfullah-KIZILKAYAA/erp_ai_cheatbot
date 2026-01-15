from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from access.models import Role, OdooModel

class Command(BaseCommand):
    help = 'Seeds initial roles and users for RBAA'

    def handle(self, *args, **options):
        # 1. Create Roles
        admin_role, _ = Role.objects.get_or_create(name='Admin', description='Tam Yetkili')
        manager_role, _ = Role.objects.get_or_create(name='Yönetici', description='Sınırlı Yönetim')
        staff_role, _ = Role.objects.get_or_create(name='Personel', description='Operasyonel')

        # Helper to get model
        def get_model(name):
            obj, _ = OdooModel.objects.get_or_create(model_name=name)
            return obj

        # 2. Assign Models (ManyToMany)
        admin_models = [get_model('res.partner'), get_model('sale.order'), get_model('product.product')]
        admin_role.allowed_models.set(admin_models)

        manager_models = [get_model('res.partner'), get_model('sale.order')]
        manager_role.allowed_models.set(manager_models)

        staff_models = [get_model('product.product')]
        staff_role.allowed_models.set(staff_models)

        # 3. Users
        def create_user(username, password, role):
            if not User.objects.filter(username=username).exists():
                u = User.objects.create_superuser(username=username, password=password) if role.name == 'Admin' else User.objects.create_user(username=username, password=password)
                u.profile.role = role
                u.profile.save()
                self.stdout.write(self.style.SUCCESS(f'User {username} created with role {role.name}'))

        create_user('seyfullah', 'admin123', admin_role)
        create_user('mehmet', 'mehmet123', manager_role)
        create_user('ayse', 'ayse123', staff_role)

        self.stdout.write(self.style.SUCCESS('Successfully seeded data'))
