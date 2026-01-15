import os
import xmlrpc.client
from django.core.management.base import BaseCommand
from access.models import OdooModel
from dotenv import load_dotenv

# Path logic: sync_odoo_models.py -> commands -> management -> access -> backend -> root
# Current file is backend/access/management/commands/sync_odoo_models.py
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
ENV_PATH = os.path.join(ROOT_DIR, '.env.local')
load_dotenv(ENV_PATH)

class Command(BaseCommand):
    help = 'Fetches all available models from Odoo and syncs them to local DB'

    def handle(self, *args, **options):
        url = os.getenv('ODOO_URL')
        db = os.getenv('ODOO_DB')
        username = os.getenv('ODOO_USERNAME')
        password = os.getenv('ODOO_PASSWORD')
        
        if not all([url, db, username, password]):
            self.stdout.write(self.style.ERROR(f'Odoo credentials missing in .env.local at {ENV_PATH}'))
            return

        try:
            common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
            uid = common.authenticate(db, username, password, {})
            models_proxy = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')
            
            # Fetch all models from ir.model
            all_models = models_proxy.execute_kw(db, uid, password, 'ir.model', 'search_read', [[]], {'fields': ['model', 'name']})
            
            created_count = 0
            updated_count = 0
            
            for m in all_models:
                obj, created = OdooModel.objects.update_or_create(
                    model_name=m['model'],
                    defaults={'description': m['name']}
                )
                if created:
                    created_count += 1
                else:
                    updated_count += 1
            
            self.stdout.write(self.style.SUCCESS(f'Successfully synced {len(all_models)} models. (Created: {created_count}, Updated: {updated_count})'))
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Sync failed: {str(e)}'))
